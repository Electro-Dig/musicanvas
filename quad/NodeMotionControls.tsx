import {
  type LilyNodeMotion,
  type MotionDirection,
} from './motion.ts';

export type DrawCaptureStatus = 'ready' | 'armed' | 'recording';

export interface NodeMotionControlsProps {
  motion: LilyNodeMotion;
  locked: boolean;
  drawStatus: DrawCaptureStatus;
  onMotionChange: (motion: LilyNodeMotion) => void;
  onArmDraw: () => void;
  onCancelDraw: () => void;
}

const MOTION_MODES = ['off', 'orbit', 'pendulum', 'draw', 'flash'] as const;
const RATE_OPTIONS = [2, 3, 5, 8] as const;
const DEFAULT_AMOUNT = 0.08;
const DEFAULT_RATE_CYCLES = 3;

export function NodeMotionControls({
  motion,
  locked,
  drawStatus,
  onMotionChange,
  onArmDraw,
  onCancelDraw,
}: NodeMotionControlsProps) {
  return (
    <section className="node-motion" aria-label="节点移动自动化">
      <div className="node-motion__heading">MOTION</div>
      <div className="node-motion__modes" role="group" aria-label="移动自动化模式">
        {MOTION_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            aria-label={`Motion ${mode.toUpperCase()}`}
            aria-pressed={motion.mode === mode}
            disabled={locked}
            onClick={() => onMotionChange(changeMode(motion, mode))}
          >
            {mode.toUpperCase()}
          </button>
        ))}
      </div>

      {motion.mode === 'orbit' && (
        <div className="node-motion__parameters" data-motion-mode="orbit">
          <AmountControl
            mode="ORBIT"
            amount={motion.amount ?? DEFAULT_AMOUNT}
            locked={locked}
            onChange={(amount) => onMotionChange({ ...motion, amount })}
          />
          <RateControl
            mode="ORBIT"
            rateCycles={motion.rateCycles ?? DEFAULT_RATE_CYCLES}
            locked={locked}
            onChange={(rateCycles) => onMotionChange({ ...motion, rateCycles })}
          />
          <DirectionControl
            mode="ORBIT"
            direction={motion.direction ?? 1}
            locked={locked}
            onChange={(direction) => onMotionChange({ ...motion, direction })}
          />
        </div>
      )}

      {motion.mode === 'pendulum' && (
        <div className="node-motion__parameters" data-motion-mode="pendulum">
          <AmountControl
            mode="PENDULUM"
            amount={motion.amount ?? DEFAULT_AMOUNT}
            locked={locked}
            onChange={(amount) => onMotionChange({ ...motion, amount })}
          />
          <RateControl
            mode="PENDULUM"
            rateCycles={motion.rateCycles ?? DEFAULT_RATE_CYCLES}
            locked={locked}
            onChange={(rateCycles) => onMotionChange({ ...motion, rateCycles })}
          />
          <label className="node-motion__field">
            <span>ANGLE</span>
            <input
              aria-label="PENDULUM 角度"
              type="range"
              min="0"
              max="360"
              step="1"
              value={motion.angleDegrees ?? 0}
              disabled={locked}
              onChange={(event) => onMotionChange({
                ...motion,
                angleDegrees: Number(event.currentTarget.value),
              })}
            />
            <output>{Math.round(motion.angleDegrees ?? 0)}°</output>
          </label>
          <DirectionControl
            mode="PENDULUM"
            direction={motion.direction ?? 1}
            locked={locked}
            onChange={(direction) => onMotionChange({ ...motion, direction })}
          />
        </div>
      )}

      {motion.mode === 'draw' && (
        <div className="node-motion__parameters" data-motion-mode="draw">
          <div className="node-motion__draw-state" aria-live="polite">
            DRAW {drawStatus.toUpperCase()}
          </div>
          <button
            type="button"
            aria-label={drawStatus === 'ready' ? '开始 DRAW 轨迹录制' : '取消 DRAW 轨迹录制'}
            disabled={locked}
            onClick={drawStatus === 'ready' ? onArmDraw : onCancelDraw}
          >
            {drawStatus === 'ready' ? 'DRAW PATH' : 'CANCEL'}
          </button>
          <RateControl
            mode="DRAW"
            rateCycles={motion.rateCycles ?? DEFAULT_RATE_CYCLES}
            locked={locked}
            onChange={(rateCycles) => onMotionChange({ ...motion, rateCycles })}
          />
          <DirectionControl
            mode="DRAW"
            direction={motion.direction ?? 1}
            locked={locked}
            onChange={(direction) => onMotionChange({ ...motion, direction })}
          />
        </div>
      )}

      {motion.mode === 'flash' && (
        <div className="node-motion__parameters" data-motion-mode="flash">
          <div className="node-motion__draw-state" aria-live="polite">
            FLASH {drawStatus.toUpperCase()}
          </div>
          <button
            type="button"
            aria-label={drawStatus === 'armed' ? '取消闪烁目标选取' : '开始选取闪烁目标'}
            disabled={locked}
            onClick={drawStatus === 'armed' ? onCancelDraw : onArmDraw}
          >
            {drawStatus === 'armed' ? 'CANCEL' : 'SET TARGET'}
          </button>
          <RateControl
            mode="FLASH"
            rateCycles={motion.rateCycles ?? 2}
            locked={locked}
            onChange={(rateCycles) => onMotionChange({ ...motion, rateCycles })}
          />
        </div>
      )}
    </section>
  );
}

function AmountControl({
  mode,
  amount,
  locked,
  onChange,
}: {
  mode: 'ORBIT' | 'PENDULUM';
  amount: number;
  locked: boolean;
  onChange: (amount: number) => void;
}) {
  return (
    <label className="node-motion__field">
      <span>AMOUNT</span>
      <input
        aria-label={`${mode} 移动幅度`}
        type="range"
        min="0"
        max="0.35"
        step="0.01"
        value={amount}
        disabled={locked}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <output>{Math.round(amount * 100)}%</output>
    </label>
  );
}

function RateControl({
  mode,
  rateCycles,
  locked,
  onChange,
}: {
  mode: 'ORBIT' | 'PENDULUM' | 'DRAW' | 'FLASH';
  rateCycles: number;
  locked: boolean;
  onChange: (rateCycles: number) => void;
}) {
  return (
    <label className="node-motion__field">
      <span>CYCLES</span>
      <select
        aria-label={`${mode} 周期`}
        value={rateCycles}
        disabled={locked}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      >
        {RATE_OPTIONS.map((rate) => (
          <option key={rate} value={rate}>{rate}</option>
        ))}
      </select>
    </label>
  );
}

function DirectionControl({
  mode,
  direction,
  locked,
  onChange,
}: {
  mode: 'ORBIT' | 'PENDULUM' | 'DRAW';
  direction: MotionDirection;
  locked: boolean;
  onChange: (direction: MotionDirection) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`${mode} 方向`}
      disabled={locked}
      onClick={() => onChange(direction === 1 ? -1 : 1)}
    >
      {direction === 1 ? '↻ CW' : '↺ CCW'}
    </button>
  );
}

function changeMode(
  current: LilyNodeMotion,
  mode: typeof MOTION_MODES[number],
): LilyNodeMotion {
  if (mode === 'off') return { mode: 'off' };
  if (current.mode === mode) return current;

  const timing = current.mode === 'off'
    ? { rateCycles: DEFAULT_RATE_CYCLES, phaseOffset: 0, direction: 1 as MotionDirection }
    : {
        rateCycles: current.rateCycles ?? DEFAULT_RATE_CYCLES,
        phaseOffset: current.phaseOffset ?? 0,
        direction: current.direction ?? 1,
      };
  const amount = current.mode === 'orbit' || current.mode === 'pendulum'
    ? current.amount ?? DEFAULT_AMOUNT
    : DEFAULT_AMOUNT;

  if (mode === 'orbit') return { mode, ...timing, amount };
  if (mode === 'pendulum') return { mode, ...timing, amount, angleDegrees: 0 };
  if (mode === 'flash') {
    return {
      mode,
      rateCycles: timing.rateCycles || 2,
      phaseOffset: timing.phaseOffset,
      direction: timing.direction,
      ...(current.mode === 'flash'
        ? { targetDx: current.targetDx, targetDy: current.targetDy }
        : {}),
    };
  }
  return {
    mode,
    ...timing,
    path: current.mode === 'draw' ? current.path ?? [] : [],
  };
}
