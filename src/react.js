// --- 辅助工具函数 ---

// 检查一个 key 是否是合法的 DOM 属性 (排除 children 和事件处理函数)
const isProperty = (key) => key !== "children" && !key.startsWith("on");
// 检查一个属性在两次 props 中是否发生了变化
const isNew = (prev, next) => (key) => prev[key] !== next[key];
// 检查一个属性是否在新的 props 中已经不存在了
const isGone = (prev, next) => (key) => !(key in next);
// 检查一个 key 是否是事件处理函数 (如 onClick)
const isEvent = (key) => key.startsWith("on");

// --- 全局变量 ---

// nextUnitOfWork: 下一个要处理的工作单元 (fiber)
let nextUnitWork = null;
// wipRoot: "Work in Progress" 的根 fiber，指向我们正在构建的 fiber 树的根
let wipRoot = null;
// currentRoot: 当前已经渲染到 DOM 上的 fiber 树的根
let currentRoot = null;
// deletions: 一个数组，用于存放需要从 DOM 中删除的节点
let deletions = null;
// wipFiber: 当前正在处理的函数式组件的 fiber
let wipFiber = null;
// hookIndex: 当前函数式组件中正在处理的 hook 的索引
let hookIndex = null;

// --- DOM 操作 ---

/**
 * 根据 fiber 创建一个真实的 DOM 节点
 * @param {*} fiber
 */
function createDom(fiber) {
  const dom =
    fiber.type === "TEXT_ELEMENT"
      ? document.createTextNode("")
      : document.createElement(fiber.type);

  // 初始化时，将 fiber 的 props 应用到 DOM 节点上
  updateDom(dom, {}, fiber.props);

  return dom;
}

/**
 * 更新 DOM 节点的属性 (包括事件监听器)
 * 这是 diff 算法在 commit 阶段的核心部分
 * @param {*} dom 真实的 DOM 节点
 * @param {*} prevProps 旧的属性
 * @param {*} nextProps 新的属性
 */
function updateDom(dom, prevProps, nextProps) {
  // 1. 移除旧的或已改变的事件监听器
  Object.keys(prevProps)
    .filter(isEvent)
    .filter((key) => !(key in nextProps) || isNew(prevProps, nextProps)(key))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.removeEventListener(eventType, prevProps[name]);
    });

  // 2. 移除旧的属性
  Object.keys(prevProps)
    .filter(isProperty)
    .filter(isGone(prevProps, nextProps))
    .forEach((name) => {
      dom[name] = "";
    });

  // 3. 设置新的或已改变的属性
  Object.keys(nextProps)
    .filter(isProperty)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      dom[name] = nextProps[name];
    });

  // 4. 添加新的事件监听器
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.addEventListener(eventType, nextProps[name]);
    });
}

// --- 调度与协调 (Reconciliation) ---

/**
 * 渲染的入口函数 (由 ReactDOM.createRoot().render() 调用)
 * @param {*} element React 元素
 * @param {*} container 容器 DOM 节点
 */
function render(element, container) {
  // 初始化 work-in-progress root
  wipRoot = {
    dom: container,
    props: {
      children: [element],
    },
    alternate: currentRoot, // alternate 指向旧的 fiber 树
  };
  deletions = []; // 初始化删除数组
  nextUnitWork = wipRoot; // 设置第一个工作单元
}

/**
 * 工作循环 (work loop)
 * 这是 "Concurrent Mode" (并发模式) 的核心
 * @param {*} deadline requestIdleCallback 传入的参数，表示当前帧还剩多少时间
 */
function workLoop(deadline) {
  let shouldYield = false;
  // 如果有下一个工作单元，并且当前帧还有剩余时间，就继续工作
  while (nextUnitWork && !shouldYield) {
    nextUnitWork = performUnitOfWork(nextUnitWork);
    shouldYield = deadline.timeRemaining() < 1;
  }

  // 如果没有下一个工作单元了，并且 wipRoot 存在，说明 fiber 树构建完成
  // 这时就可以将整个 fiber 树提交到 DOM
  if (!nextUnitWork && wipRoot) {
    commitRoot();
  }

  // 请求浏览器在下一次空闲时再次调用 workLoop
  requestIdleCallback(workLoop);
}

// 首次启动 workLoop
requestIdleCallback(workLoop);

/**
 * 执行一个工作单元，并返回下一个工作单元
 * @param {*} fiber
 */
function performUnitOfWork(fiber) {
  const isFunctionComponent = fiber.type instanceof Function;

  // 根据是函数组件还是原生 DOM 元素，执行不同的更新逻辑
  if (isFunctionComponent) {
    updateFunctionComponent(fiber);
  } else {
    updateHostComponent(fiber);
  }

  // --- 返回下一个工作单元 ---
  // 优先返回子节点
  if (fiber.child) {
    return fiber.child;
  }

  // 如果没有子节点，就返回兄弟节点
  let nextFiber = fiber;
  while (nextFiber) {
    if (nextFiber.sibling) {
      return nextFiber.sibling;
    }
    // 如果没有兄弟节点，就返回父节点的兄弟节点 (回溯)
    nextFiber = nextFiber.parent;
  }
  return null;
}

// --- Commit 阶段 ---

/**
 * 将 fiber 树提交到 DOM
 */
function commitRoot() {
  // 1. 先处理所有需要删除的节点
  deletions.forEach(commitWork);
  // 2. 递归地提交所有新增和更新的节点
  commitWork(wipRoot.child);
  // 3. 提交完成后，wipRoot 成为 currentRoot
  currentRoot = wipRoot;
  wipRoot = null;
}

/**
 * 递归地将 fiber 节点的变更应用到 DOM 上
 * @param {*} fiber
 */
function commitWork(fiber) {
  if (!fiber) {
    return;
  }

  // 找到最近的有真实 DOM 的父 fiber
  let domParentFiber = fiber.parent;
  while (!domParentFiber.dom) {
    domParentFiber = domParentFiber.parent;
  }
  const domParent = domParentFiber.dom;

  // 根据 effectTag 执行不同的 DOM 操作
  if (fiber.effectTag === "PLACEMENT" && fiber.dom != null) {
    // 新增节点
    domParent.appendChild(fiber.dom);
  } else if (fiber.effectTag === "UPDATE" && fiber.dom != null) {
    // 更新节点
    updateDom(fiber.dom, fiber.alternate.props, fiber.props);
  } else if (fiber.effectTag === "DELETION") {
    // 删除节点
    commitDeletion(fiber, domParent);
  }

  // 递归处理子节点和兄弟节点
  commitWork(fiber.child);
  commitWork(fiber.sibling);
}

/**
 * 删除节点的 commit 操作
 * @param {*} fiber 要删除的 fiber
 * @param {*} domParent 父 DOM 节点
 */
function commitDeletion(fiber, domParent) {
  if (fiber.dom) {
    // 如果 fiber 有真实 DOM，直接删除
    domParent.removeChild(fiber.dom);
  } else {
    // 如果 fiber 没有真实 DOM (比如函数组件)，则递归删除它的子节点
    commitDeletion(fiber.child, domParent);
  }
}

// --- Hooks 和组件更新 ---

/**
 * 更新函数式组件
 * @param {*} fiber
 */
function updateFunctionComponent(fiber) {
  // 设置全局的 wipFiber 和 hookIndex，为 useState 做准备
  wipFiber = fiber;
  hookIndex = 0;
  wipFiber.hooks = []; // 初始化 hooks 数组
  // 执行函数组件，得到子元素
  const children = [fiber.type(fiber.props)];
  // 协调子元素
  reconcileChildren(fiber, children);
}

/**
 * useState Hook 的实现
 * @param {*} initial 初始状态
 */
function useState(initial) {
  // 找到旧的 hook (如果存在)
  const oldHook =
    wipFiber.alternate &&
    wipFiber.alternate.hooks &&
    wipFiber.alternate.hooks[hookIndex];

  // 创建新的 hook
  const hook = {
    state: oldHook ? oldHook.state : initial, // 状态优先从旧 hook 获取
    queue: [], // action 队列
  };

  // 执行旧 hook 队列中的所有 action
  const actions = oldHook ? oldHook.queue : [];
  actions.forEach((action) => {
    hook.state = action(hook.state);
  });

  // setState 函数
  const setState = (action) => {
    hook.queue.push(action);
    // 创建一个新的 work-in-progress root，触发新的渲染周期
    wipRoot = {
      dom: currentRoot.dom,
      props: currentRoot.props,
      alternate: currentRoot,
    };
    nextUnitWork = wipRoot;
    deletions = [];
  };

  wipFiber.hooks.push(hook);
  hookIndex++;
  return [hook.state, setState];
}

/**
 * 更新原生 DOM 组件
 * @param {*} fiber
 */
function updateHostComponent(fiber) {
  // 如果 fiber 没有 DOM 节点，就创建一个
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }
  // 协调子元素
  reconcileChildren(fiber, fiber.props.children);
}

/**
 * 协调子元素 (Diff 算法的核心)
 * @param {*} wipFiber 当前工作中的 fiber
 * @param {*} elements 子 React 元素数组
 */
function reconcileChildren(wipFiber, elements) {
  let index = 0;
  let oldFiber = wipFiber.alternate && wipFiber.alternate.child; // 旧 fiber 树的子节点
  let prevSibling = null;

  // 同时遍历新子元素数组和旧 fiber 链表
  while (index < elements.length || oldFiber != null) {
    const element = elements[index];
    let newFiber = null;

    // 比较新旧节点类型是否相同
    const sameType = oldFiber && element && element.type == oldFiber.type;

    if (sameType) {
      // 类型相同，认为是更新
      newFiber = {
        type: oldFiber.type,
        props: element.props,
        dom: oldFiber.dom,
        parent: wipFiber,
        alternate: oldFiber,
        effectTag: "UPDATE", // 标记为更新
      };
    }
    if (element && !sameType) {
      // 类型不同，认为是新增
      newFiber = {
        type: element.type,
        props: element.props,
        dom: null,
        parent: wipFiber,
        alternate: null,
        effectTag: "PLACEMENT", // 标记为新增
      };
    }
    if (oldFiber && !sameType) {
      // 旧节点需要被删除
      oldFiber.effectTag = "DELETION"; // 标记为删除
      deletions.push(oldFiber);
    }

    if (oldFiber) {
      oldFiber = oldFiber.sibling;
    }

    // 将新 fiber 连接到 fiber 树上
    if (index === 0) {
      wipFiber.child = newFiber;
    } else if (element) {
      prevSibling.sibling = newFiber;
    }

    prevSibling = newFiber;
    index++;
  }
}

// --- React API ---

/**
 * React.createElement 的实现
 * 将 JSX 转换成 React 元素 (JS 对象)
 */
function createElement(type, props, ...children) {
  return {
    type,
    props: {
      ...props,
      children: children.map((child) =>
        typeof child === "object" ? child : createTextElement(child)
      ),
    },
  };
}

/**
 * 创建文本元素的辅助函数
 */
function createTextElement(text) {
  return {
    type: "TEXT_ELEMENT",
    props: {
      nodeValue: text,
      children: [],
    },
  };
}

// 导出公共 API
export default { render, createElement, useState };
