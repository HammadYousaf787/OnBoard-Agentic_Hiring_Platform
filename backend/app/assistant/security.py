"""One place documenting how identity is kept out of the model's hands.

hr_id is set only in routers/assistant.py, from the authenticated User
(the same `require_hr` dependency every other HR endpoint uses) -- never
from anything in the chat message or a tool argument. Every tool in
tools/ receives it via LangGraph's InjectedState, which means:

  1. It never appears in the tool's JSON schema, so the model literally
     cannot see or set it -- there is no "hr_id" parameter to fill in.
  2. It cannot be changed mid-conversation by anything the user types --
     it's part of the graph's persisted state, refreshed from the request's
     auth on every call to routers/assistant.py, not from the message text.

This mirrors the ownership check every REST endpoint already performs
(job.assigned_hr_id == current_user.id / appointment.hr_id == current_user.id)
-- the tools just apply the same rule by hand, since they have no FastAPI
request/Depends() chain to inherit it from.
"""
