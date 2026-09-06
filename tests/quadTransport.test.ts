import assert from 'node:assert/strict';
import test from 'node:test';

test('Space toggles transport globally except when typing', async () => {
  const module = await import('../quad/transport.ts').catch(() => ({}));
  const shouldToggleTransport = (module as {
    shouldToggleTransport?: (input: {
      code: string;
      repeat?: boolean;
      defaultPrevented?: boolean;
      tagName?: string;
      isContentEditable?: boolean;
      role?: string | null;
      transportSurface?: boolean;
    }) => boolean;
  }).shouldToggleTransport;
  const shouldCaptureTransportKey = (module as {
    shouldCaptureTransportKey?: (input: {
      code: string;
      repeat?: boolean;
      defaultPrevented?: boolean;
      tagName?: string;
      isContentEditable?: boolean;
      role?: string | null;
      transportSurface?: boolean;
    }) => boolean;
  }).shouldCaptureTransportKey;
  assert.equal(typeof shouldToggleTransport, 'function', '需要可测试的 Space 运输键过滤器');
  assert.equal(typeof shouldCaptureTransportKey, 'function', '需要把 Space 接管与实际切换分开判断');

  assert.equal(shouldToggleTransport!({ code: 'Space', tagName: 'DIV' }), true);
  assert.equal(shouldToggleTransport!({ code: 'Enter', tagName: 'DIV' }), false);
  assert.equal(shouldToggleTransport!({ code: 'Space', repeat: true, tagName: 'DIV' }), false);
  assert.equal(shouldCaptureTransportKey!({ code: 'Space', repeat: true, tagName: 'DIV' }), true,
    '长按 Space 的 repeat 事件应继续阻止页面滚动，但不能重复切换');
  assert.equal(shouldToggleTransport!({ code: 'Space', defaultPrevented: true, tagName: 'DIV' }), false);

  // 输入表面：不抢空格
  for (const tagName of ['INPUT', 'SELECT', 'TEXTAREA']) {
    assert.equal(shouldToggleTransport!({ code: 'Space', tagName }), false, `${tagName} 不应触发运输控制`);
  }
  assert.equal(shouldToggleTransport!({ code: 'Space', tagName: 'DIV', isContentEditable: true }), false);

  // 按钮/链接有焦点时，空格仍应全局控制播放（不再激活焦点按钮）
  for (const tagName of ['BUTTON', 'A', 'SUMMARY']) {
    assert.equal(shouldToggleTransport!({ code: 'Space', tagName }), true, `${tagName} 焦点下 Space 仍应运输控制`);
  }
  assert.equal(shouldToggleTransport!({ code: 'Space', tagName: 'DIV', role: 'button' }), true);
  assert.equal(shouldToggleTransport!({
    code: 'Space',
    tagName: 'g',
    role: 'button',
    transportSurface: true,
  }), true, 'Lily 节点获得焦点后，Space 仍应控制运输');
  assert.equal(shouldCaptureTransportKey!({
    code: 'Space',
    repeat: true,
    tagName: 'BUTTON',
  }), true, '按钮上长按 Space 不能让页面滚动，也不能激活按钮');
});
