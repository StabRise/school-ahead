// Lets a staff user hear a Piper voice from the TtsVoiceSetting admin form
// before saving it. Synthesis is WASM/browser-only (there's no Python
// implementation to call into), so this duplicates — in plain JS, since
// Django's static files aren't bundled/compiled — the same two fixes
// frontend/lib/piper-tts.ts applies: patching @diffusionstudio/vits-web's
// PATH_MAP with the voice's real path and redirecting its requests from its
// stale bundled mirror to the actual rhasspy/piper-voices repo. Loaded via
// TtsVoiceSettingAdmin.Media (tts/admin.py); does nothing if it can't find
// the voice_id field it hooks into.
(function () {
  'use strict';

  var VITS_WEB_URL = 'https://esm.sh/@diffusionstudio/vits-web@1.0.3';
  var VOICES_MANIFEST_URL = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/voices.json';
  var UPSTREAM_HF_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main';

  var vitsWebPromise = null;
  function loadVitsWeb() {
    if (!vitsWebPromise) vitsWebPromise = import(/* webpackIgnore: true */ VITS_WEB_URL);
    return vitsWebPromise;
  }

  var manifestPromise = null;
  function loadManifest() {
    if (!manifestPromise) {
      manifestPromise = fetch(VOICES_MANIFEST_URL).then(function (response) {
        if (!response.ok) throw new Error('Could not load voice manifest (HTTP ' + response.status + ')');
        return response.json();
      });
    }
    return manifestPromise;
  }

  var fetchPatched = false;
  function patchFetch(vits) {
    if (fetchPatched) return;
    fetchPatched = true;
    var originalFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.indexOf(vits.HF_BASE) === 0) {
        return originalFetch(UPSTREAM_HF_BASE + url.slice(vits.HF_BASE.length), init);
      }
      return originalFetch(input, init);
    };
  }

  async function playVoice(voiceId, text, statusEl, audioEl) {
    statusEl.textContent = 'Loading…';
    statusEl.classList.remove('tts-test-error');
    try {
      var vits = await loadVitsWeb();
      patchFetch(vits);
      var manifest = await loadManifest();
      var voice = manifest[voiceId];
      if (!voice) throw new Error('Voice not found in manifest: ' + voiceId);
      var onnxPath = Object.keys(voice.files).find(function (path) {
        return path.endsWith('.onnx') && !path.endsWith('.onnx.json');
      });
      if (!onnxPath) throw new Error('Manifest entry for ' + voiceId + ' has no .onnx file');
      vits.PATH_MAP[voiceId] = onnxPath;

      statusEl.textContent = 'Synthesizing… (first use downloads the model — can take a while)';
      var wav = await vits.predict({ text: text, voiceId: voiceId });
      audioEl.src = URL.createObjectURL(wav);
      await audioEl.play();
      statusEl.textContent = '';
    } catch (error) {
      statusEl.textContent = 'Error: ' + (error && error.message ? error.message : String(error));
      statusEl.classList.add('tts-test-error');
    }
  }

  function injectTestVoiceWidget() {
    var voiceSelect = document.getElementById('id_voice_id');
    if (!voiceSelect || document.getElementById('tts-test-voice-widget')) return;

    var wrapper = document.createElement('div');
    wrapper.id = 'tts-test-voice-widget';

    var textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.placeholder = 'Text to speak, then press Play';
    textInput.className = 'tts-test-text';

    var button = document.createElement('button');
    button.type = 'button';
    button.textContent = '▶ Test voice';
    button.className = 'button tts-test-button';

    var status = document.createElement('span');
    status.className = 'tts-test-status';

    var audio = document.createElement('audio');
    audio.style.display = 'none';

    button.addEventListener('click', function () {
      var voiceId = voiceSelect.value;
      var text = textInput.value.trim();
      if (!voiceId) {
        status.textContent = 'Pick a voice first.';
        status.classList.add('tts-test-error');
        return;
      }
      if (!text) {
        status.textContent = 'Type some text to speak first.';
        status.classList.add('tts-test-error');
        return;
      }
      playVoice(voiceId, text, status, audio);
    });

    wrapper.appendChild(textInput);
    wrapper.appendChild(button);
    wrapper.appendChild(status);
    wrapper.appendChild(audio);
    voiceSelect.parentNode.appendChild(wrapper);
  }

  document.addEventListener('DOMContentLoaded', injectTestVoiceWidget);
})();
