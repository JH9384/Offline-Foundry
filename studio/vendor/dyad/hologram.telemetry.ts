const noop = () => undefined;

const client = {
  init() { return client; },
  capture: noop,
  captureException: noop,
  identify: noop,
  reset: noop,
  opt_out_capturing: noop,
  opt_in_capturing: noop,
  flush: noop,
  isFeatureEnabled() { return false; },
  getFeatureFlag() { return undefined; },
};

export default client;
