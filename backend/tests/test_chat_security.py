from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.services.chat_service import ChatService


class RejectingChatRepo:
    async def get_session(self, session_id, user_id):
        return None

    async def add_message(self, *args, **kwargs):
        raise AssertionError("No debe escribir en sesiones ajenas")


@pytest.mark.asyncio
async def test_send_message_rejects_foreign_session_before_write():
    service = ChatService(db=object())
    service.chat_repo = RejectingChatRepo()

    with pytest.raises(HTTPException) as exc:
        await service.send_message(
            str(uuid4()),
            "que esteroides puedo usar",
            session_id=uuid4(),
        )

    assert exc.value.status_code == 404
