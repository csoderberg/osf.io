var $ = require('jquery');
var $osf = require('js/osfHelpers');
var ctx = window.contextVars;
var Range = ace.require('ace/range').Range;

var getExtension = function(filename) {
    return /(?:\.([^.]+))?$/.exec(filename)[1];
};
var validImgExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp'];

var editor = ace.edit('editor');


var autoIncrementFileName = function (name, response) {
    var num = 1;
    var new_name;
    var ext = getExtension(name);
    var base_name = name.replace('.' + ext, '')

    rename:
    while (true) {
        for(var i = 0; i < response.data.length; i++) {
            new_name = base_name + '(' + num + ').' + ext;
            if (response.data[i].attributes.name === new_name) {
                num += 1;
                new_name = base_name + '(' + num + ').' + ext;
                continue rename;
            }
        }
        break;
    }
    return new_name;
};

editor.enable = function () {
    $('#ace-loading-ball').css('display', 'none');
    editor.container.style.pointerEvents = "initial";
    editor.container.style.opacity = 1;
    editor.renderer.setStyle("disabled", false);
};

editor.disable = function () {
    $('#ace-loading-ball').css('display', 'block');
    editor.container.style.pointerEvents = "none";
    editor.container.style.opacity = 0.1;
    editor.renderer.setStyle("disabled", true);
};

var localFileHandler = function(files, cm, init, fixupInputArea, new_name) {
    var multiple = files.length > 1;
    var urls = [];
    var name;
    var ext;
    var num = cm.addLinkDef(init) + 1;
    var promises = [];
    var editor = ace.edit('editor');
    editor.disable();
    checkFolder().fail(function() {
        notUploaded(multiple);
        editor.enable();
    }).done(function(path) {
        if (!!path) {
            $.each(files, function (i, file) {
                ext = getExtension(file.name);
                name = new_name ? encodeURI(new_name) : encodeURI(file.name);
                if (validImgExtensions.indexOf(ext.toLowerCase()) <= -1) {
                    $osf.growl('Error', 'File type not supported (' +  file.name + ')', 'danger');
                    editor.enable();
                }
                else {
                    var waterbutlerURL = ctx.waterbutlerURL + 'v1/resources/' + ctx.node.id + '/providers/osfstorage' + path + '?name=' + name + '&type=file';
                    promises.push(
                        $.ajax({
                            url: waterbutlerURL,
                            type: 'PUT',
                            processData: false,
                            contentType: false,
                            beforeSend: $osf.setXHRAuthorization,
                            data: file
                        }).done(function (response) {
                            urls.splice(i, 0, response.data.links.download + '?mode=render');
                            editor.enable();
                        }).fail(function (response) {
                            notUploaded(response, false, cm, init, fixupInputArea, path, file);
                        })
                    );
                }
            });
            $.when.apply(null, promises).done(function () {
                $.each(urls, function (i, url) {
                    cm.doLinkOrImage(init, null, true, url, multiple, num + i);
                });
                fixupInputArea();
            });
        }
        else {
            notUploaded(null, multiple);
        }
    });
};

var remoteFileHandler = function(html, url, cm, init, fixupInputArea) {
    var getSrc = /src="([^"]+)"/;
    var src = getSrc.exec(html);
    //The best way to get the image is from the src attribute of image html if available
    //If not we will move forward with the URL that is provided to use
    var imgURL = src ? src[1] : url;

    //We currently do not support data:image URL's
    if (imgURL.substring(0, 10) === 'data:image') {
        $osf.growl('Error', 'Unable to handle this type of link.  Please either find another link or save the image to your computer and import it from there.');
        fixupInputArea(init);
        return;
    }
    //if we got the image url from src we can treat it as an image
    var isImg = src;
    if (!isImg) {
        //Check our url to see if it ends in a valid image extension.
        //If yes, we can treat it as an image.  Otherwise, it gets treated as a normal link
        var ext = getExtension(imgURL);
        isImg = !!ext ? validImgExtensions.indexOf(ext.toLowerCase()) > -1 : false;
    }
    cm.doLinkOrImage(init, fixupInputArea, isImg, imgURL);
};

/**
 * Adds Image/Link Drag and Drop functionality to the Ace Editor
 *
 * @param editor - Ace Editor instance
 * @param panels - PanelCollection used for getting TextAreaState
 * @param cm - CommandManager
 */
var addDragNDrop = function(editor, panels, cm, TextareaState) {
    var element = editor.container;
    editor.getPosition = function(x, y) {
        var config = editor.renderer.$markerFront.config;
        var height = config.lineHeight;
        var width = config.characterWidth;
        var row = Math.floor(y/height) < editor.session.getScreenLength() ? Math.floor(y/height) : editor.session.getScreenLength() - 1;
        var column = Math.floor(x/width) < editor.session.getScreenLastRowColumn(row) ? Math.floor(x/width) : editor.session.getScreenLastRowColumn(row);
        return {row: row, column: column};
    };

    editor.marker = {};
    editor.marker.cursor = {};
    editor.marker.active = false;
    editor.marker.update = function(html, markerLayer, session, config) {
        var height = config.lineHeight;

        var width = config.characterWidth;
        var top = markerLayer.$getTop(this.cursor.row, config);
        var left = markerLayer.$padding + this.cursor.column * width;
        html.push(
            '<div class=\'drag-drop-cursor\' style=\'',
            'height:', height, 'px;',
            'top:', top, 'px;',
            'left:', left, 'px; width:', width, 'px\'></div>'
        );
    };

    editor.marker.redraw = function() {
        this.session._signal("changeFrontMarker");
    };

    /**
     * This is called when an item is dragged over the editor
     *
     * Enables the 'drop' stuff to happen later
     *
     * Also adds a second cursor that follows around the mouse cursor and signifies where the image/link will
     * be inserted
     */
    element.addEventListener('dragover', function(event) {
        event.preventDefault();
        event.stopPropagation();
        if (!editor.marker.active) {
            editor.marker.active = true;
            editor.marker.session = editor.session;
            editor.marker.session.addDynamicMarker(editor.marker, true);
        }
        editor.marker.cursor = editor.getPosition(event.offsetX, event.offsetY);
        editor.marker.redraw();
        var effect;
        try {
          effect = event.dataTransfer.effectAllowed;
        } catch (_error) {}
        event.dataTransfer.dropEffect = 'move' === effect || 'linkMove' === effect ? 'move' : 'copy';

    }, false);

    /**
     * Called when a 'drop' occurs over the editor
     *
     * Takes a snapshot of what the current text is in order to be able to edit it as necessary
     *
     * Handles the errors that may occur with bad links/files
     */
    element.addEventListener('drop', function(event) {
        event.preventDefault();
        event.stopPropagation();

        var state = new TextareaState(panels);
        var offset = state.selection.length;
        state.selection = '';
        if (!state) {
            return;
        }

        /**
         * sets init to be the current state of the editor
         *
         * init.before is everything before the drag and drop cursor
         *
         * init.after is everything after the drag and drop cursor
         */
        var init = state.getChunks();
        init.before  = editor.session.getTextRange(new Range(0,0,editor.marker.cursor.row, editor.marker.cursor.column));
        init.after = editor.session.getTextRange(new Range(editor.marker.cursor.row, editor.marker.cursor.column + offset, Number.MAX_VALUE, Number.MAX_VALUE));

        /**
         * Sets the values of the input area to be the current values of init.before, init.selection, and init.after
         *
         * init.before = everything before cursor/selection
         *
         * init.selection = text that is highlighted
         *
         * init.after = everything after cursor.selection
         */
        var fixupInputArea = function () {
            state.setChunks(init);
            state.restore();
        };

        /**
         * If the item being dragged is from elsewhere online, html and/or URL will be defined
         *
         * html will be the HTML block for the element being dragged
         *
         * url will be some sort of url that is hopefully an image url (or an image can be parsed out)
         *
         * remoteFileHandler() will attempt to figure this out and react accordingly
         */
        var html = event.dataTransfer.getData('text/html');
        var url = event.dataTransfer.getData('URL');
        if (!!html || !!url) {
            remoteFileHandler(html, url, cm, init, fixupInputArea);
        }
        /**
         * If event.dataTransfer does not have html or url for the item(s), then try to upload it as a file
         *
         * localFileHandler() will deal with all of the error checking/handling for this
         */
        else {
            var files = event.dataTransfer.files;
            localFileHandler(files, cm, init, fixupInputArea);
        }
        editor.marker.session.removeMarker(editor.marker.id);
        editor.marker.redraw();
        editor.marker.active = false;
    }, true);

    /**
     * Called if something is dragged over the editor and then dragged back out
     *
     * Removes the second cursor
     */
    element.addEventListener('dragleave', function(event) {
        event.preventDefault();
        event.stopPropagation();
        editor.marker.session.removeMarker(editor.marker.id);
        editor.marker.redraw();
        editor.marker.active = false;
    });
};

var imageFolder = 'Wiki images';

var notUploaded = function(response, multiple, cm, init, fixupInputArea, path, file) {
    var files = multiple ? 'File(s)' : 'File';
    if(response.status === 403){
        $osf.growl('Error', files + ' not uploaded. You do not have permission to upload files to' +
            ' this project.', 'danger');
        editor.enable();
    } else if(response.status === 409){
        // If you drag something with the same name redraw the link, but tell the user what to do in
        // case they want to update the image with the same name.
        $.ajax({
            url: ctx.waterbutlerURL + 'v1/resources/' + ctx.node.id + '/providers/osfstorage' + path ,
            beforeSend: $osf.setXHRAuthorization,
            success: function (response) {
                var new_name = autoIncrementFileName(file.name, response);
                console.log(new_name);
                localFileHandler([file], cm, init, fixupInputArea, new_name);
            }
        });
    } else {
        $osf.growl('Error', files + ' not uploaded. Please refresh the page and try ' +
            'again or contact <a href="mailto: support@cos.io">support@cos.io</a> ' +
            'if the problem persists.', 'danger');
        editor.enable();
    }
};

/**
 * If the 'Wiki images' folder does not exist for the current node, createFolder generates the request to create it
 */
var createFolder = function() {
    return $.ajax({
        url: ctx.waterbutlerURL + 'v1/resources/' + ctx.node.id + '/providers/osfstorage/?name=' + imageFolder.replace(/\s+/g, '+') + '&kind=folder',
        type:'PUT',
        beforeSend: $osf.setXHRAuthorization
    });
};

/**
 * Checks to see whether there is already a 'Wiki images' folder for the current node
 *
 * If the folder doesn't exist, it attempts to create the folder
 *
 * @returns {*} The folder's path attribute if it exists/was created
 */
var checkFolder = function() {
    var folder_url = ctx.apiV2Prefix + 'nodes/' + ctx.node.id + '/files/osfstorage/?filter[kind]=folder&filter[name]=' + imageFolder.replace(/\s+/g, '+').toLowerCase();
    return $.ajax({
        url: folder_url,
        type: 'GET',
        beforeSend: $osf.setXHRAuthorization
    }).then(function(data, responseText, response) {
        var json = response.responseJSON;
        var exists = false;
        if (json.data.length > 0) {
            for (var i = 0, folder; folder = json.data[i]; i++) {
                var name = folder.attributes.name;
                if (name === imageFolder) {
                    return folder.attributes.path;
                }
            }
        }
        if (json.data.length === 0 || !exists) {
            return createFolder().then(function(response) {
                return response.data.attributes.path;
            });
        }
    });
};

module.exports = addDragNDrop;
