import React, { useState } from "./react";

/**
 * 应用的根组件
 */
const App = () => {
  // --- State ---
  // 使用我们自己实现的 useState hook 来创建 count 状态
  const [count, setCount] = useState(0);
  // 创建 text 状态
  const [text, setText] = useState("apple");

  // --- Render ---
  return (
    <div id="app">
      <h1>h1 fiber</h1>
      <h2>h2 fiber</h2>

      {/* 点击按钮时，更新 count 状态 */}
      <button onClick={() => setCount((c) => c + 1)}>count: {count}</button>
    </div>
  );
};

export default App;
