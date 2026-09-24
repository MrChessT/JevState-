import { metadataOperacion, PaginaOperacion } from "@/ui/portal/pagina-operacion";

type Props = PageProps<"/[lang]/venta/[[...ruta]]">;

export const generateMetadata = (props: Props) => metadataOperacion("venta", props);

export default function Pagina(props: Props) {
  return <PaginaOperacion operacion="venta" props={props} />;
}
