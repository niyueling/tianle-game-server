import * as logger from 'winston';
export default {
  ClientError: (player, message) => {
    logger.info(player._id, { extra: message });
  },
};
