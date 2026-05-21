declare module 'swagger-ui-react' {
  import type { ComponentType } from 'react';

  interface SwaggerUIProps {
    url?: string;
    spec?: object;
    specFile?: string;
    dom_id?: string;
    disableSwaggerScoping?: boolean;
    [key: string]: unknown;
  }

  const SwaggerUI: ComponentType<SwaggerUIProps>;
  export default SwaggerUI;
}
