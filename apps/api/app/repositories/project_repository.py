class ProjectRepository:
    def __init__(self) -> None:
        self._items: list[dict[str, object]] = []

    def list(self) -> list[dict[str, object]]:
        return list(self._items)

    def add(self, project: dict[str, object]) -> dict[str, object]:
        self._items.append(project)
        return project
