import { metadataOperacion, PaginaOperacion } from "@/ui/portal/pagina-operacion";

type Props = PageProps<"/[lang]/alquiler/[[...ruta]]">;

export const generateMetadata = (props: Props) => metadataOperacion("alquiler", props);

export default function Pagina(props: Props) {
  return <PaginaOperacion operacion="alquiler" props={props} />;
}
