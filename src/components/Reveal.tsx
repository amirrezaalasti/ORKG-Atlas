import { ReactNode } from 'react';
import { fadeUp, MotionBox } from '../constants/motion';
import { useRevealMotion } from '../hooks/useRevealMotion';

interface RevealProps {
  children: ReactNode;
}

const Reveal = ({ children }: RevealProps) => {
  const reveal = useRevealMotion();

  return (
    <MotionBox {...reveal} variants={fadeUp}>
      {children}
    </MotionBox>
  );
};

export default Reveal;
