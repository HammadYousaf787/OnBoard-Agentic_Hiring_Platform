from app.assistant.tools.applicant_actions import APPLICANT_ACTION_TOOLS
from app.assistant.tools.applicants import APPLICANT_TOOLS
from app.assistant.tools.combined import COMBINED_TOOLS
from app.assistant.tools.charts import CHART_TOOLS
from app.assistant.tools.cv import CV_TOOLS
from app.assistant.tools.interview_actions import INTERVIEW_ACTION_TOOLS
from app.assistant.tools.interviews import INTERVIEW_TOOLS
from app.assistant.tools.job_actions import JOB_ACTION_TOOLS
from app.assistant.tools.jobs import JOB_TOOLS
from app.assistant.tools.scheduling import SCHEDULING_TOOLS

ALL_TOOLS = [
    *JOB_TOOLS,
    *JOB_ACTION_TOOLS,
    *APPLICANT_TOOLS,
    *APPLICANT_ACTION_TOOLS,
    *INTERVIEW_TOOLS,
    *INTERVIEW_ACTION_TOOLS,
    *CV_TOOLS,
    *SCHEDULING_TOOLS,
    *COMBINED_TOOLS,
    *CHART_TOOLS,
]

__all__ = ["ALL_TOOLS"]
