let initialized = false;

export function initTooltips() {
  if (initialized) {
    return;
  }
  initialized = true;

  let tooltipEl = null;
  let activeTarget = null;
  let rafId = null;

  const gap = 10;
  const padding = 8;

  function ensureTooltip() {
    if (tooltipEl) {
      return tooltipEl;
    }
    tooltipEl = document.createElement("div");
    tooltipEl.className = "tooltip";
    tooltipEl.setAttribute("role", "tooltip");
    document.body.appendChild(tooltipEl);
    return tooltipEl;
  }

  function clearRaf() {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function hideTooltip() {
    clearRaf();
    if (!tooltipEl) {
      activeTarget = null;
      return;
    }
    tooltipEl.classList.remove("visible");
    activeTarget = null;
  }

  function positionTooltip() {
    clearRaf();
    const el = tooltipEl;
    if (!el || !activeTarget || !activeTarget.isConnected) {
      hideTooltip();
      return;
    }

    const rect = activeTarget.getBoundingClientRect();
    const tipRect = el.getBoundingClientRect();

    let placement = "top";
    let top = rect.top - tipRect.height - gap;
    if (top < padding) {
      placement = "bottom";
      top = rect.bottom + gap;
    }
    if (top + tipRect.height > window.innerHeight - padding) {
      placement = "top";
      top = Math.max(padding, rect.top - tipRect.height - gap);
    }

    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.min(
      Math.max(padding, left),
      window.innerWidth - tipRect.width - padding
    );

    const arrowLeft = Math.min(
      Math.max(12, rect.left + rect.width / 2 - left),
      tipRect.width - 12
    );

    el.dataset.placement = placement;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.setProperty("--arrow-left", `${arrowLeft}px`);
  }

  function schedulePosition() {
    if (!activeTarget) {
      return;
    }
    clearRaf();
    rafId = window.requestAnimationFrame(positionTooltip);
  }

  function showTooltip(target) {
    const text = target?.dataset?.tooltip;
    if (!text) {
      hideTooltip();
      return;
    }
    const el = ensureTooltip();
    if (activeTarget !== target) {
      el.textContent = text;
    }
    activeTarget = target;
    el.classList.add("visible");
    schedulePosition();
  }

  function handlePointerOver(event) {
    const target = event.target?.closest?.("[data-tooltip]");
    if (!target) {
      return;
    }
    showTooltip(target);
  }

  function handlePointerOut(event) {
    const from = event.target?.closest?.("[data-tooltip]");
    if (!from) {
      return;
    }
    const to = event.relatedTarget?.closest?.("[data-tooltip]");
    if (from === to) {
      return;
    }
    if (to) {
      showTooltip(to);
      return;
    }
    hideTooltip();
  }

  function handleFocusIn(event) {
    const target = event.target?.closest?.("[data-tooltip]");
    if (target) {
      showTooltip(target);
    }
  }

  function handleFocusOut(event) {
    const from = event.target?.closest?.("[data-tooltip]");
    if (!from) {
      return;
    }
    const to = event.relatedTarget?.closest?.("[data-tooltip]");
    if (from === to) {
      return;
    }
    hideTooltip();
  }

  document.addEventListener("pointerover", handlePointerOver);
  document.addEventListener("pointerout", handlePointerOut);
  document.addEventListener("focusin", handleFocusIn);
  document.addEventListener("focusout", handleFocusOut);
  window.addEventListener("scroll", schedulePosition, true);
  window.addEventListener("resize", schedulePosition);

  document.addEventListener("pointerdown", (event) => {
    const target = event.target?.closest?.("[data-tooltip]");
    if (!target) {
      hideTooltip();
    }
  });
}
