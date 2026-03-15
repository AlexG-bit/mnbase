(function () {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      try {
        await navigator.serviceWorker.register("/service-worker.js");
        console.log("MNBase service worker registered");
      } catch (err) {
        console.error("Service worker registration failed:", err);
      }
    });
  }

  let deferredPrompt = null;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    window.mnbaseInstallAvailable = true;
    console.log("MNBase install prompt ready");
  });

  window.mnbasePromptInstall = async function () {
    if (!deferredPrompt) {
      alert("Install prompt is not available yet. On iPhone, use Share > Add to Home Screen.");
      return;
    }

    deferredPrompt.prompt();
    const choiceResult = await deferredPrompt.userChoice;
    console.log("Install prompt result:", choiceResult.outcome);
    deferredPrompt = null;
    window.mnbaseInstallAvailable = false;
  };
})();