import React, { useRef } from 'react';

/**
 * Permite arrastar com o mouse um contêiner com rolagem horizontal (o toque já
 * rola nativamente). Desliga o snap durante o arrasto e ignora o clique que
 * termina um arrasto, para não abrir/selecionar o card por engano.
 */
export function useDragScroll() {
  const state = useRef({ active: false, moved: false, startX: 0, startLeft: 0 });

  return {
    onMouseDown: (e: React.MouseEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      const el = e.currentTarget;
      state.current = { active: true, moved: false, startX: e.clientX, startLeft: el.scrollLeft };
    },
    onMouseMove: (e: React.MouseEvent<HTMLElement>) => {
      const s = state.current;
      if (!s.active) return;
      const dx = e.clientX - s.startX;
      if (!s.moved && Math.abs(dx) > 5) {
        s.moved = true;
        e.currentTarget.style.scrollSnapType = 'none';
        e.currentTarget.style.scrollBehavior = 'auto';
      }
      if (s.moved) e.currentTarget.scrollLeft = s.startLeft - dx;
    },
    onMouseUp: (e: React.MouseEvent<HTMLElement>) => end(e.currentTarget),
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => end(e.currentTarget),
    onClickCapture: (e: React.MouseEvent<HTMLElement>) => {
      if (state.current.moved) {
        e.stopPropagation();
        e.preventDefault();
        state.current.moved = false;
      }
    },
  };

  function end(el: HTMLElement) {
    if (!state.current.active) return;
    state.current.active = false;
    el.style.scrollSnapType = '';
    el.style.scrollBehavior = '';
  }
}
