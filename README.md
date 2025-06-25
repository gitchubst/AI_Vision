# AI Vision
__You can get it here: [AI Vision](https://chromewebstore.google.com/detail/ai-vision/ghmmlbclopoakmjjbkkmoefjldgjimgk)__
<br>
<br>
Or you can get it here by downloading and settining up the extension in developer mode
<br>
A simple extension where you can right-click and take a screenshot to ask Gemini questions about pictured area.
<br>
<br>
<br>

## Downloading
Go to the green box on the right that says "Code". Once you click on it, look at the bottom of the popup and click "Download ZIP"
Once you download the zip file, make sure to unpack, or open, it. I made a similar project that should be the exact same setup except instead of putting your API key into background.js, put it in content.js. Here's the setup video for that project, [youtube video](https://youtu.be/1JC1XM8UTDM).
<br>
<br>
<br>

## API Key
In a text editor, open up your files. Go to content.js and replace the PUT_YOUR_KEY_HERE with your API key. You can find it here: [Gemini API Key](https://aistudio.google.com/app/apikey).
<br>
<br>
<br>

## Loading the Extension
Go back to Google Chrome now and on the right side of the page, right next to your profile (on the same line as the search bar), click the three dots. Now, look down until you hover over "Extensions" and click "Manage Extensions". Turn on developer mode on the right corner if it's not already on. Now, you should see 3 buttons appear, one of which is "Load unpacked". Click on that and select the folder (AI_Vision-main) that has the files for AI Vision. Once you've clicked that, it should say "extension loaded", where all you need to do now is reload any page and the extension should work.
<br>
<br>
<br>

## How to Use AI Vision
Right-click anything and a default dropdown should appear, below, in your extensions that dropdown should be something called AI Vision. Click on that and it should open a popup. You will be shown an area to put in your request. For "Your Question/Input", just put anything you want there and press enter. The input you type will be added to the picture that you took and Gemini will below. If you're too lazy to type, just click "Summarize", "Explain", or "Answer", and that will replace whatever is in the "Your Question/Input" space. On the bottom right of the popup, you can resize it to make it larger or smaller.
<br>
<br>
<br>

## Changing the model (Optional)
Skip this step if you don't want to change the model. Open content.js, where you can change the model type. Here's how. Go to where it says _const VERSION = "gemini-2.0-flash";_. The variable VERSION is at the start of content.js, right below the API key. Replace the text in the double quotes with a model of your choice. You can find more here: [Gemini Models](https://ai.google.dev/gemini-api/docs/models). Make sure that you enter the second, black part of the model variant with the dashes. Only copy and paste that part into the URL. Make sure you follow the same formatting as in the code.
<br>
<br>
<br>

## Temperature
Range: 0.0 to 2.0 (inclusive)
