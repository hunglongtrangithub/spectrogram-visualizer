import { Queue } from "queue-typescript";

const a = new Float32Array(10);
const b = new Float32Array([1, 2, 3]);
a.set(b, 9);
console.log(a);
