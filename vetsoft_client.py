import time
import requests

import config

DEFAULT_TIMEOUT = (10, 30)  # (connect, read) em segundos


class VetSoftError(Exception):
    def __init__(self, status_code: int, message: str, errors=None):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.errors = errors or {}


class VetSoftClient:
    def __init__(self, base_url=None, tenant=None, email=None, password=None):
        self.base_url = (base_url or config.BASE_URL).rstrip("/")
        self.tenant = tenant or config.TENANT
        self.email = email or config.EMAIL
        self.password = password or config.PASSWORD
        self.timeout = DEFAULT_TIMEOUT
        self._access_token = None
        self._refresh_token = None
        self._session = requests.Session()

    # ------------------------------------------------------------------
    # Autenticação
    # ------------------------------------------------------------------
    def login(self) -> dict:
        payload = {"email": self.email, "password": self.password}
        data = self._raw_request("POST", "/login", json=payload, _auth=False)
        self._apply_tokens(data)
        return data

    def refresh(self) -> dict:
        if not self._refresh_token:
            raise VetSoftError(401, "Sem refresh token disponível")
        data = self._raw_request(
            "POST", "/refresh", json={"refresh_token": self._refresh_token}, _auth=False
        )
        self._apply_tokens(data)
        return data

    def _apply_tokens(self, data: dict) -> None:
        self._access_token = data.get("access_token")
        self._refresh_token = data.get("refresh_token") or self._refresh_token

    @property
    def access_token(self) -> str | None:
        return self._access_token

    # ------------------------------------------------------------------
    # Requisições
    # ------------------------------------------------------------------
    def _raw_request(self, method: str, path: str, _auth: bool = True, **kwargs) -> dict:
        url = f"{self.base_url}{path}"
        headers = {"accept": "application/json", "X-Tenant": self.tenant}
        if "headers" in kwargs:
            headers.update(kwargs.pop("headers"))
        if _auth and self._access_token:
            headers["Authorization"] = f"Bearer {self._access_token}"
        kwargs.setdefault("timeout", self.timeout)

        def _send() -> requests.Response:
            try:
                return self._session.request(method, url, headers=headers, **kwargs)
            except requests.Timeout as exc:
                raise VetSoftError(504, "Tempo esgotado ao falar com o VetSoft.") from exc
            except requests.RequestException as exc:
                raise VetSoftError(502, f"Falha de conexão com o VetSoft: {exc}") from exc

        resp = _send()

        if resp.status_code == 401 and _auth:
            try:
                self.refresh()
            except VetSoftError:
                self.login()
            headers["Authorization"] = f"Bearer {self._access_token}"
            resp = _send()

        if resp.status_code == 429:
            retry_after = float(resp.headers.get("Retry-After", 1))
            time.sleep(min(retry_after, 30))
            return self._raw_request(method, path, _auth=_auth, **kwargs)

        return self._decode(resp)

    @staticmethod
    def _decode(resp: requests.Response) -> dict:
        try:
            body = resp.json()
        except ValueError:
            body = {}
        if resp.status_code >= 400:
            raise VetSoftError(
                resp.status_code,
                body.get("message", f"Erro HTTP {resp.status_code}"),
                body.get("errors"),
            )
        return body

    def _request(self, method: str, path: str, **kwargs) -> dict:
        return self._raw_request(method, path, _auth=True, **kwargs)

    def _paginate(self, path: str, params: dict | None = None, per_page: int = 100) -> list[dict]:
        params = dict(params or {})
        params.setdefault("per_page", min(per_page, 100))
        items: list[dict] = []
        page = 1
        while True:
            body = self._request("GET", path, params={**params, "page": page})
            data = body.get("data", [])
            items.extend(data)
            meta = body.get("meta", {})
            if page >= (meta.get("last_page") or 1):
                break
            page += 1
        return items

    # ------------------------------------------------------------------
    # Estética (banho e tosa)
    # ------------------------------------------------------------------
    def list_estetica(
        self,
        dat_inicial: str | None = None,
        dat_final: str | None = None,
        cod_situacao_atual: int | None = None,
        incluir_cancelados: bool = False,
        search: str | None = None,
        cod_cliente: int | None = None,
        cod_animal: int | None = None,
        cod_usuario_responsavel: int | None = None,
        tip_transporte: str | None = None,
        per_page: int = 100,
    ) -> list[dict]:
        params = {}
        if dat_inicial:
            params["dat_inicial"] = dat_inicial
        if dat_final:
            params["dat_final"] = dat_final
        if cod_situacao_atual is not None:
            params["cod_situacao_atual"] = cod_situacao_atual
        if incluir_cancelados:
            params["incluir_cancelados"] = "true"
        if search:
            params["search"] = search
        if cod_cliente:
            params["cod_cliente"] = cod_cliente
        if cod_animal:
            params["cod_animal"] = cod_animal
        if cod_usuario_responsavel:
            params["cod_usuario_responsavel"] = cod_usuario_responsavel
        if tip_transporte:
            params["tip_transporte"] = tip_transporte
        return self._paginate("/estetica", params=params, per_page=per_page)

    def get_estetica(self, cod_evento: int) -> dict:
        return self._request("GET", f"/estetica/{cod_evento}").get("data", {})

    def list_estetica_services(self, search: str | None = None) -> list[dict]:
        params = {}
        if search:
            params["search"] = search
        return self._paginate("/estetica-services", params=params)

    def list_plan_credits(
        self, search: str | None = None, plano: str | None = None, servico: str | None = None
    ) -> list[dict]:
        params = {}
        if search:
            params["search"] = search
        if plano:
            params["plano"] = plano
        if servico:
            params["servico"] = servico
        return self._paginate("/plan-credits", params=params)

    def list_tenant_users(self, search: str | None = None) -> list[dict]:
        params = {}
        if search:
            params["search"] = search
        return self._request("GET", "/tenant-users", params=params).get("data", [])

    def list_clients(self, search: str | None = None, contato: str | None = None) -> list[dict]:
        params = {}
        if search:
            params["search"] = search
        if contato:
            params["contato"] = contato
        return self._paginate("/clients", params=params)

    def list_animals(self, search: str | None = None) -> list[dict]:
        params = {}
        if search:
            params["search"] = search
        return self._paginate("/animals", params=params)

    def get_animal(self, cod_animal: int) -> dict:
        return self._request("GET", f"/animals/{cod_animal}").get("data", {})

    def list_services(self, search: str | None = None) -> list[dict]:
        params = {"status": "active"}
        if search:
            params["search"] = search
        return self._paginate("/services", params=params)