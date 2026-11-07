// Ask the sync worker to run soon. The worker registers itself (startSync) so the field data module
// does not import the network handlers.
let kick: () => void = () => {};
export const setKick = (fn: () => void) => {
  kick = fn;
};
export const kickSync = () => kick();
