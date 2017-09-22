from datetime import datetime, timedelta
from django.utils import timezone
import mock
from nose.tools import *  # noqa
import pytz

from osf.models import OSFUser
from tests.base import OsfTestCase
from osf_tests.factories import AuthUserFactory, NodeLogFactory, InstitutionFactory
from scripts.analytics.user_summary import UserSummary, LOG_THRESHOLD


class TestUserCount(OsfTestCase):
    def setUp(self):
        self.yesterday = timezone.now() - timedelta(1)
        self.a_while_ago = timezone.now() - timedelta(2)
        super(TestUserCount, self).setUp()
        for i in range(0, 3):
            u = AuthUserFactory()
            u.is_registered = True
            # Unclear why passwords are being set but it forces the users is_active status to false, which makes tests fail. 
            # When converted to pytest determine whether this is necessary for some unclear reason
            # u.password = 'wow' + str(i)
            u.date_confirmed = self.yesterday
            u.save()
        # Make one of those 3 a depth user
        for i in range(LOG_THRESHOLD + 1):
            NodeLogFactory(action='file_added', user=u)
        u = AuthUserFactory()
        u.is_registered = True
        u.password = 'wow'
        u.date_confirmed = self.a_while_ago
        u.save()
        for i in range(LOG_THRESHOLD + 1):
            NodeLogFactory(action='file_added', user=u)
        for i in range(0, 2):
            u = AuthUserFactory()
            u.date_confirmed = None
            u.save()
        u = AuthUserFactory()
        u.date_disabled = self.yesterday
        u.save()
        u = AuthUserFactory()
        u.date_disabled = self.a_while_ago
        u.save()

        OSFUser.objects.all().update(date_registered=self.yesterday)

    @mock.patch.object(UserSummary, 'calculate_stickiness')
    def test_gets_users(self, mock_calculate_stickiness):
        mock_calculate_stickiness.return_value = .1
        data = UserSummary().get_events(self.yesterday.date())[0]
        assert_equal(data['status']['active'], 4)
        assert_equal(data['status']['unconfirmed'], 2)
        assert_equal(data['status']['deactivated'], 2)
        assert_equal(data['status']['depth'], 2)
        assert_equal(data['status']['stickiness'], .1)
        assert_equal(data['status']['new_users_daily'], 3)
        assert_equal(data['status']['new_users_with_institution_daily'], 0)
        assert_equal(data['status']['merged'], 0)

        user = OSFUser.objects.filter(is_active=True).first()
        user.affiliated_institutions.add(InstitutionFactory())
        user.save()

        data = UserSummary().get_events(self.yesterday.date())[0]
        assert_equal(data['status']['new_users_with_institution_daily'], 1)

    @mock.patch.object(UserSummary, 'calculate_stickiness')
    def test_gets_only_users_from_given_date(self, mock_calculate_stickiness):
        mock_calculate_stickiness.return_value = .1
        data = UserSummary().get_events(self.a_while_ago.date())[0]
        assert_equal(data['status']['active'], 1)
        assert_equal(data['status']['unconfirmed'], 0)
        assert_equal(data['status']['deactivated'], 1)
        assert_equal(data['status']['depth'], 1)
        assert_equal(data['status']['stickiness'], .1)
        assert_equal(data['status']['new_users_daily'], 0)
        assert_equal(data['status']['new_users_with_institution_daily'], 0)
        assert_equal(data['status']['merged'], 0)

    @mock.patch.object(UserSummary, 'calculate_stickiness')
    def test_merged_user(self, mock_calculate_stickiness):
        mock_calculate_stickiness.return_value = .1
        user = AuthUserFactory(fullname='Annie Lennox')
        merged_user = AuthUserFactory(fullname='Lisa Stansfield')
        user.save()
        merged_user.save()

        user.merge_user(merged_user)
        user.save()
        merged_user.save()
        user.reload()
        merged_user.reload()

        OSFUser.objects.all().update(date_registered=self.yesterday)

        data = UserSummary().get_events(self.yesterday.date())[0]
        assert_equal(data['status']['merged'], 1)
