// 元素是否是属性
const isProperty = (key) => key !== "children" && key !== "key";

let nextUnitWork, rootFiber;
// 渲染第一个元素
function render(element, container) {
  if (!nextUnitWork) {
    nextUnitWork = {
      dom: container,
      props: {
        children: [element],
      },
    };
    rootFiber = nextUnitWork;
  }

  // const dom =
  //   element.type === "TEXT_ELEMENT"
  //     ? document.createTextNode("")
  //     : document.createElement(element.type);
  // Object.keys(element.props)
  //   .filter(isProperty)
  //   .forEach((key) => {
  //     dom[key] = element.props[key];
  //   });
  // element.props.children.forEach((child) => {
  //   render(child, dom);
  // });
  // container.appendChild(dom);
  // return dom;
}

function createDom(fiber) {
  const dom =
    fiber.type === "TEXT_ELEMENT"
      ? document.createTextNode("")
      : document.createElement(fiber.type);
  Object.keys(fiber.props)
    .filter(isProperty)
    .forEach((key) => {
      dom[key] = fiber.props[key];
    });
  return dom;
}

// 有没有富余时间
function workLoop(deadline) {
  let shouldYield = false;
  while (nextUnitWork && !shouldYield) {
    nextUnitWork = performUnitOfWork(nextUnitWork);
    shouldYield = deadline.timeRemaining() < 1;
  }
  if (!nextUnitWork && rootFiber) {
    commitRoot(rootFiber);
  }

  requestIdleCallback(workLoop);
}

function commitRoot(rootFiber) {
  commitWork(rootFiber.child);
  rootFiber = null;
  nextUnitWork = null; // 添加这行
}
function commitWork(fiber) {
  if (!fiber) {
    return;
  }

  let domParentFiber = fiber.parent;
  while (!domParentFiber.dom) {
    domParentFiber = domParentFiber.parent;
  }
  const parentDom = domParentFiber.dom;

  if (fiber.dom) {
    parentDom.appendChild(fiber.dom);
  }
  commitWork(fiber.child);
  commitWork(fiber.sibling);
}

// 执行单元工作
function performUnitOfWork(fiber) {
  const isFunctionComponent = typeof fiber.type === "function";

  if (isFunctionComponent) {
    const elements = [fiber.type(fiber.props)];
    reconcileChildren(fiber, elements);
  } else {
    if (!fiber.dom) {
      fiber.dom = createDom(fiber);
    }
    reconcileChildren(fiber, fiber.props.children);
  }

  if (fiber.child) {
    return fiber.child;
  }
  let nextFiber = fiber;
  while (nextFiber) {
    if (nextFiber.sibling) {
      return nextFiber.sibling;
    }
    nextFiber = nextFiber.parent;
  }
  return null;
}

function reconcileChildren(fiber, elements) {
  let index = 0;
  let prevFiber = null;

  while (index < elements.length) {
    const element = elements[index];
    const newFiber = {
      type: element.type,
      props: element.props,
      dom: null,
      parent: fiber,
      child: null,
      sibling: null,
    };

    if (index == 0) {
      fiber.child = newFiber;
    } else {
      prevFiber.sibling = newFiber;
    }
    prevFiber = newFiber;
    index++;
  }
}

// 创建元素
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
// 创建文本元素
function createTextElement(text) {
  return {
    type: "TEXT_ELEMENT",
    props: {
      nodeValue: text,
      children: [],
    },
  };
}

export default { render, createElement };
