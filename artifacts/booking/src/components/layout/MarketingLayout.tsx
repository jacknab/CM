import MarketingNav from "./MarketingNav";
import MarketingFooter from "./MarketingFooter";

interface MarketingLayoutProps {
  children: React.ReactNode;
  hideNavActions?: boolean;
}

export default function MarketingLayout({ children, hideNavActions = false }: MarketingLayoutProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <MarketingNav hideActions={hideNavActions} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {children}
      </div>
      <MarketingFooter />
    </div>
  );
}
