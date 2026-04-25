if ('serviceWorker' in navigator) {
  window.addEventListener('DOMContentLoaded', function () {
    var refreshing = false;
    navigator.serviceWorker.register('/serviceWorker.js').then(function (registration) {
      console.log('ServiceWorker registration successful with scope: ', registration.scope);
      registration.update().then(function (res) {
        console.log('ServiceWorker registration update: ', res);
      });
      window._SW_ENABLED = true;
    }, function (err) {
      console.error('ServiceWorker registration failed: ', err);
    });
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (refreshing) return;
      refreshing = true;
      console.log('ServiceWorker controllerchange — reloading');
      window.location.reload();
    });
  });
}
