import Navbar from "./Navbar";
import ProductShowcase from "../components/ProductShowcase";

/**
 * Landing page: the header plus the catalogue of products and asesorías,
 * which now opens the page directly on the Masvale blue.
 */
export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <ProductShowcase />
    </div>
  );
}
