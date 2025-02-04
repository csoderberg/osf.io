# -*- coding: utf-8 -*-
# Generated by Django 1.11.15 on 2019-08-13 20:20
from __future__ import unicode_literals

from django.db import migrations, models
import django.db.models.deletion
import django_extensions.db.fields
import osf.models.base
import osf.utils.datetime_aware_jsonfield


class Migration(migrations.Migration):

    dependencies = [
        ('osf', '0189_deleted_field_data')
    ]

    operations = [
        migrations.CreateModel(
            name='RegistrationSchemaBlock',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created', django_extensions.db.fields.CreationDateTimeField(auto_now_add=True, verbose_name='created')),
                ('modified', django_extensions.db.fields.ModificationDateTimeField(auto_now=True, verbose_name='modified')),
                ('_id', models.CharField(db_index=True, default=osf.models.base.generate_object_id, max_length=24, unique=True)),
                ('help_text', models.TextField()),
                ('example_text', models.TextField(null=True)),
                ('registration_response_key', models.CharField(blank=True, db_index=True, max_length=255, null=True)),
                ('schema_block_group_key', models.CharField(db_index=True, max_length=24, null=True)),
                ('block_type', models.CharField(choices=[(b'page-heading', b'page-heading'), (b'section-heading', b'section-heading'), (b'subsection-heading', b'subsection-heading'), (b'paragraph', b'paragraph'), (b'question-label', b'question-label'), (b'short-text-input', b'short-text-input'), (b'long-text-input', b'long-text-input'), (b'file-input', b'file-input'), (b'contributors-input', b'contributors-input'), (b'single-select-input', b'single-select-input'), (b'multi-select-input', b'multi-select-input'), (b'select-input-option', b'select-input-option'), (b'select-other-option', b'select-other-option')], db_index=True, max_length=31)),
                ('display_text', models.TextField()),
                ('required', models.BooleanField(default=False)),
            ],
        ),
        migrations.AddField(
            model_name='registrationschema',
            name='config',
            field=osf.utils.datetime_aware_jsonfield.DateTimeAwareJSONField(blank=True, default=dict, encoder=osf.utils.datetime_aware_jsonfield.DateTimeAwareJSONEncoder),
        ),
        migrations.AddField(
            model_name='registrationschema',
            name='description',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='registrationschemablock',
            name='schema',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='schema_blocks', to='osf.RegistrationSchema'),
        ),
        migrations.AlterUniqueTogether(
            name='registrationschemablock',
            unique_together=set([('schema', 'registration_response_key')]),
        ),
        migrations.AlterOrderWithRespectTo(
            name='registrationschemablock',
            order_with_respect_to='schema',
        ),
    ]
