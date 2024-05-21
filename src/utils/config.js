/**
 * Created by user on 2016-07-05.
 */

import * as config from 'config';

config.getDefault = (key, def) => {
  if (config.has(key)) {
    return config.get(key);
  }
  return def;
};

export default config;
