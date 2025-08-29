import App from "./app.jsx";
import React from "./react.js";

import { createRoot } from "./reactDom.js";
createRoot(document.querySelector("#root")).render(React.createElement(App));

// function callback(deadline) {
//   console.log(deadline.timeRemaining());
//   requestIdleCallback(callback);
// }

// requestIdleCallback(callback);
