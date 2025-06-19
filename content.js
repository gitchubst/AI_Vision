(function() {
    let GEMINI_API_KEY = "";
    let VERSION = "gemini-2.5-flash";
    let TEMPERATURE = 1;

    const MODELS = {
        "Gemini 2.5 Flash": "gemini-2.5-flash",
        "Gemini 2.5 Flash Lite": "gemini-2.5-flash-lite-preview-06-17",
    };

    function saveSettings() {
        chrome.storage.local.set({
            'geminiApiKey': GEMINI_API_KEY,
            'geminiModel': VERSION,
            'geminiTemperature': TEMPERATURE
        }, () => {
        });
    }
    async function loadSettings() {
        return new Promise((resolve) => {
            chrome.storage.local.get([
                'geminiApiKey',
                'geminiModel',
                'geminiTemperature'
            ], (result) => {
                if (result.geminiApiKey) GEMINI_API_KEY = result.geminiApiKey;
                if (result.geminiModel) {
                    VERSION = result.geminiModel;
                } else {
                    VERSION = "gemini-2.5-flash";
                }
                if (result.geminiTemperature !== undefined) TEMPERATURE = result.geminiTemperature;
                apiUrl = updateApiUrl();
                resolve();
            });
        });
    }

    function validateTemperature(value) {
        const temp = parseFloat(value);
        if (isNaN(temp) || temp < 0 || temp > 2) {
            return false;
        }
        return true;
    }

    function validateApiKey(key) {
        return key && key.trim() !== "";
    }

    function updateApiUrl() {
        return `https://generativelanguage.googleapis.com/v1beta/models/${VERSION}:generateContent?key=${GEMINI_API_KEY}`;
    }

    let apiUrl = updateApiUrl();

    try {
        if (window.geminiExtensionGlobalDragMouseMove) {
            document.removeEventListener('mousemove', window.geminiExtensionGlobalDragMouseMove);
            window.geminiExtensionGlobalDragMouseMove = null;
        }
        if (window.geminiExtensionGlobalDragMouseUp) {
            document.removeEventListener('mouseup', window.geminiExtensionGlobalDragMouseUp);
            window.geminiExtensionGlobalDragMouseUp = null;
        }

        const idsToRemove = ['gemini-screenshot-overlay', 'gemini-selection-rectangle', 'gemini-popup', 'gemini-temp-error', 'gemini-uncaught-error-fallback'];
        idsToRemove.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.remove();
            }
        });

        if (document.body.classList.contains('gemini-extension-active')) {
            document.body.classList.remove('gemini-extension-active');
        }

        let overlay, selectionRectDiv, startX, startY, isSelecting = false;
        let capturedImageData = null;
        let popup, queryInput, responseArea, sendButton;
        let initialPopupWidth, initialPopupHeight, initialMouseX, initialMouseY;
        let resizeMouseMoveHandler, resizeMouseUpHandler;

        function initSelection() {
            document.body.classList.add('gemini-extension-active');
            overlay = document.createElement('div');
            overlay.id = 'gemini-screenshot-overlay';
            document.body.appendChild(overlay);
            selectionRectDiv = document.createElement('div');
            selectionRectDiv.id = 'gemini-selection-rectangle';
            selectionRectDiv.style.display = 'none';
            overlay.appendChild(selectionRectDiv);
            overlay.addEventListener('mousedown', handleMouseDown);
            overlay.addEventListener('mousemove', handleMouseMove);
            overlay.addEventListener('mouseup', handleMouseUp);
            overlay.addEventListener('mouseleave', cancelSelection);

            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.zIndex = '2147483647';
            overlay.style.backgroundColor = 'rgba(0, 100, 200, 0.1)';
            overlay.style.cursor = 'crosshair';
        }

        function handleMouseDown(e) {
            if (e.button !== 0) return;
            startX = e.clientX;
            startY = e.clientY;
            selectionRectDiv.style.left = startX + 'px';
            selectionRectDiv.style.top = startY + 'px';
            selectionRectDiv.style.width = '0px';
            selectionRectDiv.style.height = '0px';
            selectionRectDiv.style.display = 'block';
            isSelecting = true;
            e.preventDefault();
        }

        function handleMouseMove(e) {
            if (!isSelecting) return;
            const currentX = e.clientX;
            const currentY = e.clientY;
            const width = Math.abs(currentX - startX);
            const height = Math.abs(currentY - startY);
            const newX = Math.min(startX, currentX);
            const newY = Math.min(startY, currentY);
            selectionRectDiv.style.left = newX + 'px';
            selectionRectDiv.style.top = newY + 'px';
            selectionRectDiv.style.width = width + 'px';
            selectionRectDiv.style.height = height + 'px';
            e.preventDefault();
        }

        async function handleMouseUp(e) {
            if (!isSelecting) return;
            isSelecting = false;
            const rect = {
                x: parseInt(selectionRectDiv.style.left),
                y: parseInt(selectionRectDiv.style.top),
                width: parseInt(selectionRectDiv.style.width),
                height: parseInt(selectionRectDiv.style.height)
            };
            if (overlay) overlay.style.display = 'none';

            if (rect.width <= 5 || rect.height <= 5) {
                capturedImageData = null;
                showPopup();
                cleanupSelection();
                return;
            }

            try {
                const dataUrl = await chrome.runtime.sendMessage({
                    action: "captureVisibleTab",
                    options: { format: "jpeg", quality: 90 }
                });
                if (dataUrl && typeof dataUrl === 'object' && dataUrl.error) {
                    alertUser(`Failed to capture screen: ${dataUrl.error}`);
                    cleanupSelection();
                } else if (dataUrl && typeof dataUrl === 'string') {
                    cropImage(dataUrl, rect.x, rect.y, rect.width, rect.height, (croppedDataUrl) => {
                        if (croppedDataUrl) {
                            capturedImageData = croppedDataUrl.split(',')[1];
                            showPopup();
                        } else {
                            alertUser("Failed to crop image.");
                        }
                        cleanupSelection();
                    });
                } else {
                    alertUser("Failed to capture screen. Please try again.");
                    cleanupSelection();
                }
            } catch (error) {
                alertUser(`Capture failed: ${error.message}. Ensure extension is loaded & try reloading page.`);
                cleanupSelection();
            }
        }

        function cropImage(dataUrl, cropX, cropY, cropWidth, cropHeight, callback) {
            const img = new Image();
            img.onload = () => {
                const dpr = window.devicePixelRatio || 1;
                const canvas = document.createElement('canvas');
                canvas.width = cropWidth * dpr;
                canvas.height = cropHeight * dpr;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, cropX * dpr, cropY * dpr, cropWidth * dpr, cropHeight * dpr, 0, 0, cropWidth * dpr, cropHeight * dpr);
                callback(canvas.toDataURL('image/jpeg', 0.9));
            };
            img.onerror = () => {
                alertUser("Failed to process image. Page content might be restricted or image failed to load.");
                callback(null);
            }
            img.src = dataUrl;
        }

        function cleanupSelection() {
            document.body.classList.remove('gemini-extension-active');
            if (overlay) {
                overlay.removeEventListener('mousedown', handleMouseDown);
                overlay.removeEventListener('mousemove', handleMouseMove);
                overlay.removeEventListener('mouseup', handleMouseUp);
                overlay.removeEventListener('mouseleave', cancelSelection);
                overlay.remove();
                overlay = null;
            }
            if (selectionRectDiv) {
                selectionRectDiv.remove();
                selectionRectDiv = null;
            }
        }

        function cancelSelection() {
            if (isSelecting) {
                isSelecting = false;
            }
        }

        async function showPopup() {
            await loadSettings();
            
            const existingPopup = document.getElementById('gemini-popup');
            if (existingPopup) {
                existingPopup.remove();
            }
            
            popup = document.createElement('div');
            popup.id = 'gemini-popup';
            
            const header = document.createElement('div');
            header.id = 'gemini-popup-header';
            const title = document.createElement('span');
            title.textContent = 'AI Vision';
            
            const headerControls = document.createElement('div');
            headerControls.style.display = 'flex';
            headerControls.style.alignItems = 'center';
            
            const instructionsButton = document.createElement('button');
            instructionsButton.id = 'gemini-instructions-button';
            instructionsButton.innerHTML = 'Help';
            instructionsButton.title = 'Instructions';
            
            const settingsButton = document.createElement('button');
            settingsButton.id = 'gemini-settings-button';
            settingsButton.innerHTML = 'Settings';
            settingsButton.title = 'Settings';
            
            const closeButton = document.createElement('button');
            closeButton.id = 'gemini-popup-close';
            closeButton.innerHTML = '&times;';
            closeButton.onclick = closePopup;
            
            headerControls.appendChild(instructionsButton);
            headerControls.appendChild(settingsButton);
            headerControls.appendChild(closeButton);
            
            header.appendChild(title);
            header.appendChild(headerControls);
            
            const content = document.createElement('div');
            content.id = 'gemini-popup-content';
            
            const instructionsPanel = document.createElement('div');
            instructionsPanel.id = 'gemini-instructions-panel';
            instructionsPanel.textContent = "After setting up your API key, right-click or click the extension to open the screenshot tool. Take a screenshot, then either type a prompt or click a preset button to ask about the image. Your input and screenshot will then be sent over to Gemini for a response. If you click a single spot or select too little, Gemini will only use your text input to respond.";
            content.appendChild(instructionsPanel);
            
            instructionsButton.onclick = () => {
                instructionsPanel.classList.toggle('show');
                const settingsPanel = document.getElementById('gemini-settings-panel');
                if (settingsPanel) {
                    settingsPanel.classList.remove('show');
                }
            };
            
            const settingsPanel = document.createElement('div');
            settingsPanel.id = 'gemini-settings-panel';
            
            settingsButton.onclick = () => {
                settingsPanel.classList.toggle('show');
                instructionsPanel.classList.remove('show');
            };
            
            const apiKeyGroup = document.createElement('div');
            apiKeyGroup.className = 'settings-group';
            const apiKeyLabel = document.createElement('label');
            apiKeyLabel.textContent = 'API Key:';
            const apiKeyInput = document.createElement('input');
            apiKeyInput.type = 'text';
            apiKeyInput.value = GEMINI_API_KEY;
            apiKeyInput.placeholder = 'Enter your Gemini API key';
            apiKeyInput.autocomplete = 'off';
            apiKeyInput.setAttribute('autocorrect', 'off');
            apiKeyInput.setAttribute('autocapitalize', 'off');
            apiKeyInput.setAttribute('spellcheck', 'off');

            const apiKeyHelp = document.createElement('div');
            apiKeyHelp.className = 'api-key-help';
            apiKeyHelp.innerHTML = 'Visit <a href="https://aistudio.google.com/app/apikey" target="_blank">Google AI Studio</a> to get your API key';
            
            const apiKeyError = document.createElement('div');
            apiKeyError.className = 'error-message';
            if (!validateApiKey(GEMINI_API_KEY)) {
                apiKeyError.textContent = 'Put an API key';
            }
            
            apiKeyGroup.appendChild(apiKeyLabel);
            apiKeyGroup.appendChild(apiKeyInput);
            apiKeyGroup.appendChild(apiKeyHelp);
            apiKeyGroup.appendChild(apiKeyError);
            
            const modelGroup = document.createElement('div');
            modelGroup.className = 'settings-group';
            const modelLabel = document.createElement('label');
            modelLabel.textContent = 'Model:';
            const modelOptions = document.createElement('div');
            modelOptions.className = 'radio-group';
            
            Object.entries(MODELS).forEach(([displayName, value]) => {
                const option = document.createElement('div');
                option.className = 'radio-option';
                const radio = document.createElement('input');
                radio.type = 'radio';
                radio.name = 'model';
                radio.value = value;
                radio.checked = value === VERSION;
                const label = document.createElement('label');
                label.textContent = displayName;
                option.appendChild(radio);
                option.appendChild(label);
                modelOptions.appendChild(option);
            });
            
            modelGroup.appendChild(modelLabel);
            modelGroup.appendChild(modelOptions);
            
            const tempGroup = document.createElement('div');
            tempGroup.className = 'settings-group';
            const tempLabel = document.createElement('label');
            tempLabel.textContent = 'Temperature (0 to 2 inclusive):';
            const tempInput = document.createElement('input');
            tempInput.type = 'number';
            tempInput.min = '0';
            tempInput.max = '2';
            tempInput.step = '0.1';
            tempInput.value = TEMPERATURE;
            
            const tempError = document.createElement('div');
            tempError.className = 'error-message';
            
            tempGroup.appendChild(tempLabel);
            tempGroup.appendChild(tempInput);
            tempGroup.appendChild(tempError);
            
            settingsPanel.appendChild(apiKeyGroup);
            settingsPanel.appendChild(modelGroup);
            settingsPanel.appendChild(tempGroup);
            content.appendChild(settingsPanel);
            
            apiKeyInput.onchange = (e) => {
                const newKey = e.target.value.trim();
                if (validateApiKey(newKey)) {
                    GEMINI_API_KEY = newKey;
                    apiKeyError.textContent = '';
                } else {
                    apiKeyError.textContent = 'Put an API key';
                }
                apiUrl = updateApiUrl();
                saveSettings();
            };
            
            modelOptions.onclick = (e) => {
                if (e.target.type === 'radio') {
                    VERSION = e.target.value;
                    apiUrl = updateApiUrl();
                    saveSettings();
                }
            };
            
            tempInput.onchange = (e) => {
                if (validateTemperature(e.target.value)) {
                    TEMPERATURE = parseFloat(e.target.value);
                    tempError.textContent = '';
                } else {
                    tempError.textContent = 'Temperature must be between 0 and 2';
                    tempInput.value = '1';
                    TEMPERATURE = 1;
                }
                saveSettings();
            };
            
            if (capturedImageData === null) {
                const textOnlyMessage = document.createElement('div');
                textOnlyMessage.textContent = 'Gemini will only use your text input to respond';
                textOnlyMessage.style.textAlign = 'center';
                textOnlyMessage.style.fontSize = '14px';
                textOnlyMessage.style.color = '#6c757d';
                textOnlyMessage.style.marginBottom = '10px';
                content.appendChild(textOnlyMessage);
            }

            queryInput = document.createElement('input');
            queryInput.id = 'gemini-popup-query-input';
            queryInput.type = 'text';
            queryInput.placeholder = 'Type something and press enter';
            queryInput.autocomplete = 'off';
            queryInput.setAttribute('autocorrect', 'off');
            queryInput.setAttribute('autocapitalize', 'off');
            queryInput.setAttribute('spellcheck', 'false');
            queryInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') handleSendQuery();
            });
            content.appendChild(queryInput);
            
            if (capturedImageData !== null) {
                const presetsDiv = document.createElement('div');
                presetsDiv.id = 'gemini-popup-presets';
                const presets = [
                    { text: "Summarize", query: "Summarize this image. 1 sentence. Also, dont say this image says, talk about the thing or things in the image and answer whatever question or query is before this. Make this english less complicated and more simple english and esier to understand, but still make sure to use the proper technical langauge." },
                    { text: "Explain", query: "Explain the thing in the image, like what it means or what it does or what it is. 1 sentence. Also, dont say this image says, talk about the thing or things in the image and answer whatever question or query is before this. Make this english less complicated and more simple english and esier to understand, but still make sure to use the proper technical langauge." },
                    { text: "Answer", query: "What is shown in this image or if this is a question, answer it. Be specific. 1 sentence. Also, dont say this image says, talk about the thing or things in the image and answer whatever question or query is before this. Make this english less complicated and more simple english and esier to understand, but still make sure to use the proper technical langauge." }
                ];
                presets.forEach(preset => {
                    const button = document.createElement('button');
                    button.textContent = preset.text;
                    button.onclick = () => handleSendQuery(preset.query);
                    presetsDiv.appendChild(button);
                });
                content.appendChild(presetsDiv);
            }
            
            sendButton = document.createElement('button');
            sendButton.id = 'gemini-popup-send';
            sendButton.textContent = 'Send';
            sendButton.onclick = () => handleSendQuery();
            content.appendChild(sendButton);
            
            responseArea = document.createElement('div');
            responseArea.id = 'gemini-popup-response-area';
            responseArea.textContent = 'Put in a question';
            content.appendChild(responseArea);
            
            popup.appendChild(header);
            popup.appendChild(content);
            
            const resizeHandle = document.createElement('div');
            resizeHandle.id = 'gemini-popup-resize-handle';
            popup.appendChild(resizeHandle);
            resizeHandle.addEventListener('mousedown', initResize);
            
            document.body.appendChild(popup);
            makeDraggable(popup, header);
            queryInput.focus();
        }

        function closePopup() {
            if (popup) {
                popup.remove();
                popup = null;
            }
            capturedImageData = null;
        }

        async function handleSendQuery(presetQuery = null) {
            if (!validateApiKey(GEMINI_API_KEY)) {
                alertUser('Please set your Gemini API key in the settings near the top right corner');
                return;
            }

            let queryText = presetQuery || queryInput.value.trim();

            if (!capturedImageData && !queryText) {
                alertUser('Please type a query.');
                return;
            }

            if (capturedImageData && !queryText) {
                queryText = "What's in this image?";
            }
            
            queryText = `${queryText}. one sentence unless the user explicitly asks for more detail or to write a paragraph or to write a essay, otherwise write 1 sentence. Also, dont say this image says, talk about the thing or things in the image and answer whatever question or query is before this. Make this english less complicated and more simple english and esier to understand, but still make sure to use the proper technical langauge.`;

            sendButton.textContent = 'Sending';
            sendButton.disabled = true;
            sendButton.classList.add('loading');
            responseArea.textContent = 'Processing your request';
            responseArea.classList.remove('error');

            const parts = [];
            if (capturedImageData) {
                parts.push({ inline_data: { mime_type: "image/jpeg", data: capturedImageData } });
            }
            parts.push({ text: queryText });

            const requestBody = {
                contents: [{ parts: parts }],
                generationConfig: {
                    temperature: TEMPERATURE
                }
            };

            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ error: { message: "Unknown API error structure" } }));
                    const errorMessage = errorData?.error?.message || 'No specific message.';
                    if (errorMessage.includes('API key not valid')) {
                        throw new Error(`API Error: 400. API key not valid. Please put in a valid API key.`);
                    } else {
                        throw new Error(`API Error: ${response.status} ${response.statusText}. ${errorMessage}`);
                    }
                }
                const data = await response.json();
                if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
                    let responseText = data.candidates[0].content.parts[0].text;
                    responseText = responseText.replace(/\*\*/g, '');
                    responseText = responseText.replace(/\*/g, '');
                    responseText = responseText.replace(/_/g, '');
                    responseText = responseText.replace(/`/g, '');
                    responseArea.textContent = responseText;
                } else if (data.promptFeedback?.blockReason) {
                    const blockMessage = `Blocked: ${data.promptFeedback.blockReason}. ${data.promptFeedback.blockReasonMessage || 'No additional details.'}`;
                    responseArea.textContent = blockMessage;
                    responseArea.classList.add('error');
                } else {
                    responseArea.textContent = 'Received an empty or unexpected response from Gemini.';
                }
            } catch (error) {
                responseArea.textContent = `Error: ${error.message}`;
                responseArea.classList.add('error');
            } finally {
                sendButton.textContent = 'Send';
                sendButton.disabled = false;
                sendButton.classList.remove('loading');
            }
        }

        function makeDraggable(element, handle) {
            let dragMouseMoveHandler, dragMouseUpHandler;
            handle.onmousedown = function(event) {
                if (event.button !== 0) return;
                event.preventDefault();
                let shiftX = event.clientX - element.getBoundingClientRect().left;
                let shiftY = event.clientY - element.getBoundingClientRect().top;
                element.style.position = 'fixed';
                function moveAt(mouseClientX, mouseClientY) {
                    let newX = mouseClientX - shiftX;
                    let newY = mouseClientY - shiftY;
                    const maxX = window.innerWidth - element.offsetWidth;
                    const maxY = window.innerHeight - element.offsetHeight;
                    newX = Math.max(0, Math.min(newX, maxX));
                    newY = Math.max(0, Math.min(newY, maxY));
                    element.style.left = newX + 'px';
                    element.style.top = newY + 'px';
                }
                moveAt(event.clientX, event.clientY);
                dragMouseMoveHandler = function(e_move) { moveAt(e_move.clientX, e_move.clientY); };
                window.geminiExtensionGlobalDragMouseMove = dragMouseMoveHandler;
                dragMouseUpHandler = function() {
                    document.removeEventListener('mousemove', dragMouseMoveHandler);
                    document.removeEventListener('mouseup', dragMouseUpHandler);
                    if(handle) handle.style.userSelect = '';
                    window.geminiExtensionGlobalDragMouseMove = null;
                    window.geminiExtensionGlobalDragMouseUp = null;
                };
                window.geminiExtensionGlobalDragMouseUp = dragMouseUpHandler;
                document.addEventListener('mousemove', dragMouseMoveHandler);
                document.addEventListener('mouseup', dragMouseUpHandler);
                if(handle) handle.style.userSelect = 'none';
            };
            if(handle) handle.ondragstart = () => false;
        }

        function initResize(e) {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            initialMouseX = e.clientX;
            initialMouseY = e.clientY;
            if (!popup) return;
            initialPopupWidth = popup.offsetWidth;
            initialPopupHeight = popup.offsetHeight;

            resizeMouseMoveHandler = function(eventMove) {
                const dx = eventMove.clientX - initialMouseX;
                const dy = eventMove.clientY - initialMouseY;
                let newWidth = initialPopupWidth + dx;
                let newHeight = initialPopupHeight + dy;
                const minWidth = 300;
                const minHeight = 200;
                if (popup) {
                    popup.style.width = Math.max(minWidth, newWidth) + 'px';
                    popup.style.height = Math.max(minHeight, newHeight) + 'px';
                }
            };

            resizeMouseUpHandler = function() {
                document.removeEventListener('mousemove', resizeMouseMoveHandler);
                document.removeEventListener('mouseup', resizeMouseUpHandler);
                if (document.body) document.body.style.cursor = 'default';
                if (popup) popup.style.userSelect = '';
                resizeMouseMoveHandler = null;
                resizeMouseUpHandler = null;
            };

            document.addEventListener('mousemove', resizeMouseMoveHandler);
            document.addEventListener('mouseup', resizeMouseUpHandler);
            if (document.body) document.body.style.cursor = 'nwse-resize';
            if (popup) popup.style.userSelect = 'none';
        }

        function alertUser(message) {
            if (responseArea && popup && popup.parentNode) {
                responseArea.textContent = message;
                responseArea.classList.add('error');
            } else {
                let tempErrorDiv = document.getElementById('gemini-temp-error');
                if (tempErrorDiv) tempErrorDiv.remove();
                tempErrorDiv = document.createElement('div');
                tempErrorDiv.id = 'gemini-temp-error';
                
                const messageSpan = document.createElement('span');
                messageSpan.textContent = message;
                tempErrorDiv.appendChild(messageSpan);

                const closeBtn = document.createElement('button');
                closeBtn.innerHTML = '&times;';
                closeBtn.className = 'temp-error-close';
                closeBtn.onclick = () => tempErrorDiv.remove();
                tempErrorDiv.appendChild(closeBtn);

                document.body.appendChild(tempErrorDiv);
                setTimeout(() => { if (tempErrorDiv && tempErrorDiv.parentNode) tempErrorDiv.remove(); }, 5000);
            }
        }

        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === "someOtherActionFromBackground") {
                sendResponse({ status: "success", confirmation: "Action handled by content script." });
                return false;
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key.toLowerCase() === 'e') {
                e.preventDefault();
                if (document.getElementById('gemini-screenshot-overlay')) {
                    cleanupSelection();
                }
                if (document.getElementById('gemini-popup')) {
                    closePopup();
                }
            }
        });

        function showApiKeyPopup() {
            const popup = document.createElement('div');
            popup.id = 'gemini-api-key-popup';
            popup.innerHTML = `
                <div id="gemini-api-key-header">Enter API Key <button id="gemini-api-key-close">×</button></div>
                <div id="gemini-api-key-body">
                    <p>Visit <a href="https://aistudio.google.com/app/apikey" target="_blank">Google AI Studio</a> to get your API key</p>
                    <input type="text" id="gemini-api-key-input" placeholder="Enter your API key here" />
                    <button id="gemini-api-key-save">Save</button>
                </div>
            `;
            document.body.appendChild(popup);

            const closeButton = document.getElementById('gemini-api-key-close');
            const saveButton = document.getElementById('gemini-api-key-save');

            closeButton.addEventListener('click', () => {
                popup.remove();
                chrome.storage.local.set({ 'needApiKeyPopup': true });
            });

            saveButton.addEventListener('click', () => {
                const apiKeyInput = document.getElementById('gemini-api-key-input');
                const apiKey = apiKeyInput.value.trim();
                if (apiKey) {
                    GEMINI_API_KEY = apiKey;
                    chrome.storage.local.set({
                        'geminiApiKey': apiKey,
                        'needApiKeyPopup': false
                    }, () => {
                        saveSettings();
                        popup.remove();
                        initSelection();
                    });
                } else {
                    alert('Please enter a valid API key.');
                }
            });

            popup.style.position = 'fixed';
            popup.style.top = '50px';
            popup.style.right = '50px';
        }

        (async () => {
            try {
                await loadSettings();
                chrome.storage.local.get(['needApiKeyPopup', 'geminiApiKey'], (result) => {
                    if (!result.geminiApiKey || result.needApiKeyPopup) {
                        showApiKeyPopup();
                    } else {
                        initSelection();
                    }
                });
            } catch (error) {
                console.error('Error during initialization:', error);
                showApiKeyPopup();
            }
        })();

    } catch (e) {
        try {
            let errorFallbackDiv = document.getElementById('gemini-uncaught-error-fallback');
            if (errorFallbackDiv) errorFallbackDiv.remove();
            errorFallbackDiv = document.createElement('div');
            errorFallbackDiv.id = 'gemini-uncaught-error-fallback';
            errorFallbackDiv.style.position = 'fixed';
            errorFallbackDiv.style.top = '10px';
            errorFallbackDiv.style.left = '50%';
            errorFallbackDiv.style.transform = 'translateX(-50%)';
            errorFallbackDiv.style.backgroundColor = 'red';
            errorFallbackDiv.style.color = 'white';
            errorFallbackDiv.style.padding = '15px';
            errorFallbackDiv.style.border = '2px solid darkred';
            errorFallbackDiv.style.borderRadius = '8px';
            errorFallbackDiv.style.zIndex = '2147483647';
            errorFallbackDiv.style.fontFamily = 'Arial, sans-serif';
            errorFallbackDiv.style.fontSize = '16px';
            errorFallbackDiv.style.textAlign = 'center';
            errorFallbackDiv.textContent = `Extension Error: AI Vision Helper encountered a critical issue. Error: ${e.message}`;
            document.body.appendChild(errorFallbackDiv);
            setTimeout(() => { if (errorFallbackDiv) errorFallbackDiv.remove(); }, 10000);
        } catch (fallbackError) {
        }
    }
})();
