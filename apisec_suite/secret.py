class Secret(str):
    __slots__ = ()

    def __repr__(self) -> str:
        return "'***'"
