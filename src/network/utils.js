/**
 * Created by user on 2016-07-02.
 */

function serializeMessage(packet) {
  return JSON.stringify(packet);
}

function deserializeMessage(data) {
  return JSON.parse(data);
}

export {
  serializeMessage,
  deserializeMessage,
};
