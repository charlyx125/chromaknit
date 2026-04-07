import { ReactNode } from "react";

interface StepSectionProps {
  number: number;
  label: string;
  title: ReactNode;
  children: ReactNode;
}

function StepSection({ number, label, title, children }: StepSectionProps) {
  return (
    <div className="step-section">
      <div className="step-label">
        <span className="step-num">{number}</span> {label}
      </div>
      <h2 className="step-title">{title}</h2>
      {children}
    </div>
  );
}

export default StepSection;
