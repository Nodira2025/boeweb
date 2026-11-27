/* global Sentry */
(() => {
  'use strict';

  const dsn = 'https://74e6f2d6c6b769a2d3d739b9c729c43a@o4512479490932736.ingest.us.sentry.io/4512503847452672';

  function removeUrlParameters(value) {
    if (typeof value !== 'string') return value;
    try {
      const url = new URL(value, window.location.origin);
      return `${url.origin}${url.pathname}`;
    } catch {
      return value.split(/[?#]/, 1)[0];
    }
  }

  function removePrivateDetails(event) {
    delete event.user;
    delete event.request;
    delete event.extra;
    delete event.contexts;
    delete event.breadcrumbs;
    delete event.message;

    for (const exception of event.exception?.values || []) {
      exception.value = '[details redacted]';
      for (const frame of exception.stacktrace?.frames || []) {
        frame.filename = removeUrlParameters(frame.filename);
        frame.abs_path = removeUrlParameters(frame.abs_path);
        delete frame.vars;
      }
    }
    return event;
  }

  // The loader calls this hook before initializing the browser SDK.
  window.sentryOnLoad = function () {
    Sentry.init({
      dsn,
      environment: /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname) ? 'local' : 'production',
      sendDefaultPii: false,
      beforeSend: removePrivateDetails
    });
  };
})();
