import React from 'react';

export interface NodePitchControlsProps {
  aStep: number;
  bStep: number | null;
  aNoteName: string;
  bNoteName: string | null;
  motionEnabled: boolean;
  locked: boolean;
  onChangeAStep(step: number): void;
  onChangeBStep(step: number): void;
  onToggleEndpointPitch(): void;
}

export const NodePitchControls: React.FC<NodePitchControlsProps> = ({
  aStep,
  bStep,
  aNoteName,
  bNoteName,
  motionEnabled,
  locked,
  onChangeAStep,
  onChangeBStep,
  onToggleEndpointPitch,
}) => {
  const endpointEnabled = bStep !== null;
  return (
    <section className="node-pitch" data-endpoint-enabled={endpointEnabled ? 'true' : 'false'} aria-label="节点音高与运动端点">
      <header>
        <span>PITCH</span>
        <button
          type="button"
          aria-label="启用运动端点双音"
          aria-pressed={endpointEnabled}
          disabled={locked}
          onClick={onToggleEndpointPitch}
        >{endpointEnabled ? 'A↔B ON' : 'A↔B'}</button>
      </header>
      <PitchStepper
        label="A STEP"
        step={aStep}
        noteName={aNoteName}
        disabled={locked}
        onChange={onChangeAStep}
      />
      {endpointEnabled && (
        <PitchStepper
          label="B STEP"
          step={bStep}
          noteName={bNoteName ?? '—'}
          disabled={locked}
          onChange={onChangeBStep}
        />
      )}
      <small>{!motionEnabled ? '先开启 Motion' : endpointEnabled ? '下周期生效' : 'A 音持续'}</small>
    </section>
  );
};

const PitchStepper: React.FC<{
  label: string;
  step: number;
  noteName: string;
  disabled: boolean;
  onChange(step: number): void;
}> = ({ label, step, noteName, disabled, onChange }) => (
  <div className="node-pitch__stepper">
    <span>{label}</span>
    <button type="button" disabled={disabled} aria-label={`${label} 降低`} onClick={() => onChange(step - 1)}>−</button>
    <output><b>{formatStep(step)}</b><em>{noteName}</em></output>
    <button type="button" disabled={disabled} aria-label={`${label} 升高`} onClick={() => onChange(step + 1)}>+</button>
  </div>
);

function formatStep(step: number): string {
  return step > 0 ? `+${step}` : String(step);
}
