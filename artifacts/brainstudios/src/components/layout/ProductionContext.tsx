import { createContext, useContext, ReactNode, useState, useEffect } from "react";

interface ProductionContextType {
  activeProductionId: number | null;
  setActiveProductionId: (id: number | null) => void;
}

const ProductionContext = createContext<ProductionContextType | undefined>(undefined);

export function ProductionProvider({ children }: { children: ReactNode }) {
  const [activeProductionId, setActiveProductionId] = useState<number | null>(null);

  // Read from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("bs_active_prod");
    if (saved) {
      setActiveProductionId(Number(saved));
    }
  }, []);

  const handleSetActive = (id: number | null) => {
    setActiveProductionId(id);
    if (id !== null) {
      localStorage.setItem("bs_active_prod", id.toString());
    } else {
      localStorage.removeItem("bs_active_prod");
    }
  };

  return (
    <ProductionContext.Provider value={{ activeProductionId, setActiveProductionId: handleSetActive }}>
      {children}
    </ProductionContext.Provider>
  );
}

export function useActiveProduction() {
  const context = useContext(ProductionContext);
  if (context === undefined) {
    throw new Error("useActiveProduction must be used within a ProductionProvider");
  }
  return context;
}
