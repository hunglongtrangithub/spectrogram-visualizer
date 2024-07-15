const numCallbacks = 3;
const bufferCallbacks = [];
for (let i = 0; i < numCallbacks; i++) {
  bufferCallbacks.push((buffer) => {
    console.log(`callback ${i} with buffer: ${buffer}`);
    return buffer;
  });
}

const buffers = [1, 2];
// const newBuffers = buffers.map((buffer, i) => bufferCallbacks[i](buffer));
const newBuffers = buffers.map((buffer, i) => console.log(bufferCallbacks[i]));
console.log(newBuffers);
