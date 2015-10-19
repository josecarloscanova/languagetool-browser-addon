/* LanguageTool for Chrome 
 * Copyright (C) 2015 Daniel Naber (http://www.danielnaber.de)
 * 
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301
 * USA
 */
"use strict";

function getCheckResult(text, callback, errorCallback) {
    let url = 'https://languagetool.org:8081/';
    let req = new XMLHttpRequest();
    req.open('POST', url);
    req.onload = function() {
        let response = req.response;
        if (!response) {
            errorCallback('No response from ' + url);
            return;
        }
        callback(response);
    };
    req.onerror = function() {
        errorCallback('Network error (' + url + ')');
    };
    let params = 'autodetect=1&text=' + encodeURIComponent(text);
    req.send(params);
}

function renderStatus(statusHtml) {
    document.getElementById('status').innerHTML = statusHtml;
}

function renderMatchesToHtml(resultXml) {
    let dom = (new window.DOMParser()).parseFromString(resultXml, "text/xml");
    let language = dom.getElementsByTagName("language")[0].getAttribute("name");
    var html = "Detected language: " + escapeHtml(language);
    let matches = dom.getElementsByTagName("error");
    if (matches.length === 0) {
        html += "<p>No errors found</p>";
    } else {
        html += "<ul>";
        for (let match in matches) {
            let m = matches[match];
            if (m.getAttribute) {
                let context = m.getAttribute("context");
                html += "<li>";
                html += renderContext(context, m);
                html += renderReplacements(context, m);
                html += escapeHtml(m.getAttribute("msg"));
                html += "</li>";
            }
        }
        html += "</ul>";
    }
    html += "<p class='poweredBy'>Text checked remotely by <a target='_blank' href='https://languagetool.org'>languagetool.org</a></p>";
    return html;
}

function renderContext(context, m) {
    let errStart = parseInt(m.getAttribute("contextoffset"));
    let errLen = parseInt(m.getAttribute("errorlength"));
    return "<div class='errorArea'>"
          + escapeHtml(context.substr(0, errStart))
          + "<span class='error'>" + escapeHtml(context.substr(errStart, errLen)) + "</span>" 
          + escapeHtml(context.substr(errStart + errLen))
          + "</div>";
}

function renderReplacements(context, m) {
    let replacementsStr = m.getAttribute("replacements");
    let contextOffset = parseInt(m.getAttribute('contextoffset'));
    let errLen = parseInt(m.getAttribute("errorlength"));
    let contextLeft = context.substr(0, contextOffset).replace(/^\.\.\./, "");
    let contextRight = context.substr(contextOffset + errLen).replace(/\.\.\.$/, "");
    let errorText = context.substr(contextOffset, errLen);
    var html = "";
    if (replacementsStr) {
        let replacements = replacementsStr.split("#");
        var i = 0;
        for (let idx in replacements) {
            if (i++ > 0) {
                html += " | ";
            }
            html += "<a href='#' " +
                "data-contextleft='" + escapeHtml(contextLeft) + "'" +
                "data-contextright='" + escapeHtml(contextRight) + "'" +
                "data-errortext='" + escapeHtml(errorText) + "'" +
                "data-replacement='" + escapeHtml(replacements[idx]) + "'" +
                "'>" + replacements[idx] + "</a>";
        }
        html += "<br/>";
    }
    return html;
}

function escapeHtml(s) {
    return s.replace(/&/g, '&amp;')
            .replace(/>/g, '&gt;')
            .replace(/</g, '&lt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
}

function handleCheckResult(response, tabs) {
    if (!response) {
        // not sure *why* this happens...
        renderStatus('If you have just installed or (re-)activated this extension, ' +
                     'please reload the tab first in which you want to check a text.');
        return;
    }
    if (response.message) {
        renderStatus(response.message);
        return;
    }
    getCheckResult(response.text, function(resultText) {
        let resultHtml = renderMatchesToHtml(resultText);
        renderStatus(resultHtml);
        let links = document.getElementsByTagName("a");
        for (var i = 0; i < links.length; i++) {
            let link = links[i];
            link.addEventListener("click", function() {
                if (link.getAttribute('data-contextleft')) {   // don't attach to link to our homepage
                    let data = {
                        action: 'applyCorrection',
                        contextLeft: link.getAttribute('data-contextleft'),
                        contextRight: link.getAttribute('data-contextright'),
                        errorText: link.getAttribute('data-errortext'),
                        replacement: link.getAttribute('data-replacement')
                    };
                    chrome.tabs.sendMessage(tabs[0].id, data, function(response) {
                        doCheck();   // re-check, as applying changes might change context also for other errors
                    });
                }
            });
        }
    }, function(errorMessage) {
        renderStatus('Could not check text: ' + errorMessage);
    });
}

function startCheckMaybeWithWarning() {
    if (localStorage.allowRemoteCheck === "true") {
        doCheck();
    } else {
        renderStatus('<p>This extension will check your text by sending it to ' +
            '<a href="https://languagetool.org" target="_blank">https://languagetool.org</a> ' +
            'over an encrypted connection. Your text will not be stored. For details, ' +
            'see <a href="https://languagetool.org/privacy/" target="_blank">our privacy policy</a>.</p>' +
            '<a class="privacyLink" id="confirmCheck" href="#">Continue and don\'t warn again</a> &nbsp;&nbsp;' +
            '<a class="privacyLink" id="cancelCheck" href="#">Cancel</a>');
        document.getElementById("confirmCheck").addEventListener("click", function() {
            localStorage.allowRemoteCheck = "true";
            doCheck();
        });
        document.getElementById("cancelCheck").addEventListener("click", function() { self.close(); });
    }
}

function doCheck() {
    renderStatus('<img src="images/throbber_28.gif"> Checking...');
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {action: 'checkText'}, function(response) {
            handleCheckResult(response, tabs);
        });
    });
}

document.addEventListener('DOMContentLoaded', function() {
    startCheckMaybeWithWarning();
});