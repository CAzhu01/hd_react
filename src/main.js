import App from "./app.jsx";

import { createRoot } from "./reactDom.js";
createRoot(document.querySelector("#root")).render(App);

// function callback(deadline) {
//   console.log(deadline.timeRemaining());
//   requestIdleCallback(callback);
// }

// requestIdleCallback(callback);
