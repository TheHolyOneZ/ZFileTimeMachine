import { createContext, useContext } from 'react';

interface Ctx {
  resetGuide: () => void;
}

export const OnboardingContext = createContext<Ctx>({ resetGuide: () => {} });
export const useOnboardingContext = () => useContext(OnboardingContext);
