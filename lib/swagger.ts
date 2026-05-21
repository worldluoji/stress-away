import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.1.0',
    info: {
      title: 'Stress Away API',
      version: '1.0.0',
      description: 'API 文档',
    },
    servers: [{ url: '/api', description: 'Local server' }],
    components: {
      headers: {
        DeviceId: { schema: { type: 'string' }, description: '设备ID' },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  },
  apis: ['./app/api/**/route.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
