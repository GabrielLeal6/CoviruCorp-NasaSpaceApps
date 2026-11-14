# CoviruCorp-NasaSpaceApps

## Executar localmente

Instale as dependências e inicie a API e o frontend no mesmo servidor:

```bash
poetry install
poetry run uvicorn --app-dir src lunarnav.api.main:app --reload --host 0.0.0.0 --port 8000
```

Abra <http://localhost:8000/> para acessar o site e <http://localhost:8000/docs> para consultar a API.