import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { IconButton } from '../src/ui';

describe('IconButton', () => {
  it('keeps its base class and button semantics while forwarding props', () => {
    const onClick = vi.fn();
    const props = {
      className: 'mobile-menu',
      label: 'Open navigation',
      disabled: true,
      'data-testid': 'menu-button',
      onClick,
    };
    const element = createElement(IconButton, props, 'Menu');
    const button = IconButton({ ...props, children: 'Menu' });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain('class="icon-button mobile-menu"');
    expect(markup).toContain('type="button"');
    expect(markup).toContain('title="Open navigation"');
    expect(markup).toContain('aria-label="Open navigation"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('data-testid="menu-button"');
    expect(button.props.onClick).toBe(onClick);
  });
});
