/**
 * Module that controls the {{cookiecutter.full_name}} node settings. Includes Knockout view-model
 * for syncing data.
 */
;(function (global, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['knockout', 'jquery', 'osfutils', 'language', 'knockoutpunches'], factory);
    } else if (typeof $script === 'function') {
        global.DataverseNodeConfig  = factory(ko, jQuery);
        $script.done('dataverseUserConfig');
    } else {
        global.DataverseNodeConfig  = factory(ko, jQuery);
    }
}(this, function(ko, $) {

    ko.punches.enableAll();
    var language = $.osf.Language.Addons.dataverse;

    function ViewModel(url) {
        var self = this;
        self.url = url;
        self.urls = ko.observable();
        self.dataverseUsername = ko.observable();

        self.ownerName = ko.observable();
        self.nodeHasAuth = ko.observable(false);
        self.userHasAuth = ko.observable(false);
        self.userIsOwner = ko.observable(false);
        self.connected = ko.observable(false);
        self.loadedSettings = ko.observable(false);

        self.dataverses = ko.observableArray([]);
        self.studies = ko.observableArray([]);

        self.savedStudyHdl = ko.observable();
        self.savedStudyTitle = ko.observable();
        self.savedDataverseAlias = ko.observable();
        self.savedDataverseTitle = ko.observable();

        self.savedStudyUrl = ko.computed(function() {
            return (self.urls()) ? self.urls().studyPrefix + self.savedStudyHdl() : null;
        });
        self.savedDataverseUrl = ko.computed(function() {
            return (self.urls()) ? self.urls().dataversePrefix + '/' + self.savedDataverseAlias() : null;
        });

        self.selectedDataverseAlias = ko.observable();
        self.selectedStudyHdl = ko.observable();
        self.selectedDataverseTitle = ko.computed(function() {
            for (var i=0; i < self.dataverses().length; i++) {
                var data = self.dataverses()[i];
                if (data.alias == self.selectedDataverseAlias())
                    return data.title;
            }
            return null;
        });
        self.selectedStudyTitle = ko.computed(function() {
            for (var i=0; i < self.studies().length; i++) {
                var data = self.studies()[i];
                if (data.hdl == self.selectedStudyHdl())
                    return data.title;
            }
            return null;
        });

        self.showStudySelect = ko.observable(false);
        self.showLinkedStudy = ko.computed(function() {
            return self.savedStudyHdl();
        });
        self.showLinkDataverse = ko.computed(function() {
            return self.userHasAuth() && !self.nodeHasAuth() && self.loadedSettings();
        });
        self.showCreateButton = ko.computed(function() {
            return !self.userHasAuth() && !self.nodeHasAuth() && self.loadedSettings();
        });
        self.showPicker = ko.computed(function() {
           return self.dataverses().length > 0;
        });
        /**
         * Update the view model from data returned from the server.
         */

        self.updateFromData = function(data) {
            self.urls(data.urls);
            self.dataverseUsername(data.dataverseUsername);
            self.ownerName(data.ownerName);
            self.nodeHasAuth(data.nodeHasAuth);
            self.userHasAuth(data.userHasAuth);
            self.userIsOwner(data.userIsOwner);

            if (self.nodeHasAuth()){
                self.dataverses(data.dataverses);
                self.savedDataverseAlias(data.savedDataverse.alias);
                self.savedDataverseTitle(data.savedDataverse.title);
                self.selectedDataverseAlias(data.savedDataverse.alias);
                self.savedStudyHdl(data.savedStudy.hdl);
                self.savedStudyTitle(data.savedStudy.title)
                self.getStudies(); // Sets studies, selectedStudyHdl
            }
        };

        // Update above observables with data from the server
        $.ajax({
            url: url, type: 'GET', dataType: 'json',
            success: function(response) {
                // Update view model
                self.updateFromData(response.result);
                self.loadedSettings(true);
            },
            error: function(xhr, textStatus, error){
                console.error(textStatus); console.error(error);
                self.changeMessage(language.userSettingsError, 'text-warning');
            }
        })

        // Flashed messages
        self.message = ko.observable('');
        self.messageClass = ko.observable('text-info')

        self.setInfo = function() {
            return $.ajax({
                url: self.urls().set,
                type: 'POST',
                data: ko.toJSON({
                    dataverse: {alias: self.selectedDataverseAlias},
                    study: {hdl: self.selectedStudyHdl}
                }),
                contentType: 'application/json',
                dataType: 'json',
                success: function(response) {
                    self.savedDataverseAlias(self.selectedDataverseAlias());
                    self.savedDataverseTitle(self.selectedDataverseTitle());
                    self.savedStudyHdl(self.selectedStudyHdl());
                    self.savedStudyTitle(self.selectedStudyTitle());
                    self.changeMessage('Settings updated.', 'text-success', 5000);
                },
                error: function() {
                    self.changeMessage('The study could not be set at this time.', 'text-danger');
                }
            });
        }

        self.getStudies = function() {
            self.studies([{title: '<<< Retrieving Studies >>>', hdl: ''}])
            self.showStudySelect(false);
            return $.ajax({
                url: self.urls().getStudies,
                type: 'POST',
                data: ko.toJSON({alias: self.selectedDataverseAlias}),
                contentType: 'application/json',
                dataType: 'json',
                success: function(response) {
                    self.studies(response.studies);
                    self.showStudySelect(true);
                    self.selectedStudyHdl(self.savedStudyHdl());
                },
                error: function() {
                    self.changeMessage('Could not load studies', 'text-danger');
                }
            });
        }

        /**
         * Send PUT request to import access token from user profile.
         */
        self.importAuth = function() {
            bootbox.confirm({
                title: 'Link to Dataverse Account?',
                message: 'Are you sure you want to authorize this project with your Dataverse credentials?',
                callback: function(confirmed) {
                    if (confirmed) {
                        authorizeNode();
                    }
                }
            });
        };

        self.clickDeauth = function() {
            bootbox.confirm({
                title: 'Deauthorize?',
                message: language.confirmNodeDeauth,
                callback: function(confirmed) {
                    if (confirmed) {
                       sendDeauth();
                    }
                }
            });
        };

        // Callback for when PUT request to import user access token
        function onImportSuccess(response) {
            // Update view model based on response
            self.updateFromData(response.result);
            self.changeMessage(language.authSuccess, 'text-success', 3000);
        }

        function onImportError() {
            self.changeMessage(language.authError, 'text-danger');
        }

        function authorizeNode() {
            return $.ajax({
                url: self.urls().authorize,
                type: 'POST',
                contentType: 'application/json',
                dataType: 'json',
                success: function(response) {
                    return $.osf.putJSON(self.urls().importAuth, {},
                        onImportSuccess, onImportError);
                },
                error: function() {
                    self.changeMessage(language.authError, 'text-danger');
                }
            });
        }

        function sendDeauth() {
            return $.ajax({
                url: self.urls().deauthorize,
                type: 'DELETE',
                success: function() {
                    self.nodeHasAuth(false);
                    self.userIsOwner(false);
                    self.changeMessage(language.deauthSuccess, 'text-success', 5000);
                },
                error: function() {
                    self.changeMessage(language.deauthError, 'text-danger');
                }
            });
        }

        /** Change the flashed status message */
        self.changeMessage = function(text, css, timeout) {
            self.message(text);
            var cssClass = css || 'text-info';
            self.messageClass(cssClass);
            if (timeout) {
                // Reset message after timeout period
                setTimeout(function() {
                    self.message('');
                    self.messageClass('text-info');
                }, timeout);
            }
        };

    };

    function DataverseNodeConfig(selector, url) {
        // Initialization code
        var self = this;
        self.selector = selector;
        self.url = url;
        // On success, instantiate and bind the ViewModel
        self.viewModel = new ViewModel(url);
        $.osf.applyBindings(self.viewModel, '#dataverseScope');
    }
    return DataverseNodeConfig;

}));