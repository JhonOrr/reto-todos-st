# Todo API - Reto Técnico Serverless

Una API REST serverless para gestión de tareas construida con AWS CDK, Lambda, DynamoDB y API Gateway.

## Prerrequisitos

- **Node.js** >= 18.x
- **npm** >= 8.x
- **AWS CLI** configurado con credenciales válidas
- **AWS CDK CLI** >= 2.x

```bash
# Instala AWS CDK globalmente
npm install -g aws-cdk

# Verificar instalaciones
cdk --version
node --version
aws --version
```

## Instalación

1. **Clonar e instalar dependencias:**
```bash
git clone https://github.com/JhonOrr/reto-todos-st.git
cd reto-todos-st
npm install
```

2. **Configurar CDK:**
```bash
cdk bootstrap
```

## Instrucciones de Despliegue

### 1. Compilar el proyecto
```bash
npm run build
```

### 2. Desplegar la infraestructura
```bash
# Desplegar
cdk deploy
```

### 3. Obtener la URL del API
Después del despliegue exitoso, se verá la salida:
```
✅  RetoTodoStack

Outputs:
RetoTodoStack.ApiUrl = https://abc123def4.execute-api.us-east-1.amazonaws.com/prod/
RetoTodoStack.TableName = Todos
```
## Instrucciones de Pruebas

### Ejecutar Tests Automatizados

```bash
# Ejecutar todos los tests
npm test
```
### Probar la API Manualmente

Una vez desplegada, se puede probar la API con la colección de Postman adjunta.

Las evidencias de los tests y de la métrica en cloudwatch esta en el archivo evidencias/Evidencias Reto Técnico.docx



