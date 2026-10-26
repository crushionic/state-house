// The ending, played when the visitor returns from the last unvisited area:
// fade to glowing white, hold for 2 seconds, then the white shrinks away into
// a black screen and "What are we forgetting?" glows in the centre.
import { el } from "./ui.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

export async function playEnding() {
  const white = el("div", { class: "ending-white", "aria-hidden": "true" });
  const text = el("p", { class: "ending-text", text: "What are we forgetting?" });
  const root = el("div", { class: "ending", role: "status" }, white, text);
  document.body.append(root);
  document.body.classList.add("is-ending");

  await wait(30); // let the start state paint so the transitions run
  root.classList.add("is-white"); // fade to white (1.5 s)
  await wait(1500 + 2000); // …then hold for 2 seconds
  root.classList.add("is-black"); // white shrinks into black (1.8 s)
  await wait(reduceMotion ? 300 : 1800);
  root.classList.add("show-text"); // text glows in
}
