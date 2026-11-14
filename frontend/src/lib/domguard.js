/*
 * Browser page translation (Chrome, Samsung Internet) and some keyboard or grammar add-ons rewrite the
 * page's text behind React's back. When React later adds or removes a node next to text that was
 * swapped out, the browser throws "Failed to execute 'insertBefore' on 'Node'" and the screen crashes.
 *
 * These guards make those two DOM calls forgiving: if the node React refers to has been moved away,
 * insert at the end / skip the removal instead of throwing. Known workaround from facebook/react#11538.
 */
export const installDomGuard = () => {
  if (typeof Node !== 'function' || !Node.prototype || Node.prototype.__spendifyGuard) return;
  Node.prototype.__spendifyGuard = true;

  const removeChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function (child) {
    if (child.parentNode !== this) return child;
    return removeChild.call(this, child);
  };

  const insertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (newNode, refNode) {
    if (refNode && refNode.parentNode !== this) return insertBefore.call(this, newNode, null);
    return insertBefore.call(this, newNode, refNode);
  };
};
