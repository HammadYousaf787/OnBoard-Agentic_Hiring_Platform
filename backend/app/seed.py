"""
Seeds the database (and MinIO) with the same demo dataset the frontend
prototype ships with, so the API can be exercised end-to-end immediately.

Usage (from backend/, with the venv active):
    python -m app.seed
"""

import asyncio
import uuid
from datetime import datetime

from sqlalchemy import select

from app.core.security import hash_password
from app.core.storage import copy_cv_to_bank, ensure_bucket_exists, upload_cv
from app.database import AsyncSessionLocal
from app.models.applicant import Applicant
from app.models.appointment import Appointment
from app.models.approval_event import ApprovalEvent
from app.models.cv_bank_entry import CvBankEntry
from app.models.enums import AccountStatus, ApplicantStage, ApprovalAction, JobStatus, Role
from app.models.job import Job
from app.models.user import User


def dt(iso: str) -> datetime:
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


CV_BODY_TEMPLATE = """{name} -- Curriculum Vitae (demo placeholder)

{summary}

This is placeholder seed content for the Employee Onboarding Platform demo.
No real candidate data is contained in this file.
"""


async def seed() -> None:
    ensure_bucket_exists()

    async with AsyncSessionLocal() as db:
        existing = await db.execute(select(User).limit(1))
        if existing.scalar_one_or_none() is not None:
            print("Database already has data -- skipping seed.")
            print("(Drop and re-run migrations first if you want a clean reseed.)")
            return

        ids: dict[str, uuid.UUID] = {}

        def nid(slug: str) -> uuid.UUID:
            value = uuid.uuid4()
            ids[slug] = value
            return value

        # ---------------------------------------------------------------
        # Users
        # ---------------------------------------------------------------
        admin1 = User(
            id=nid("admin-1"),
            username="ayesha.khan",
            full_name="Ayesha Khan",
            email="admin@demo.com",
            password_hash=hash_password("Admin@123"),
            role=Role.admin,
            status=AccountStatus.approved,
            phone_number="+92 300 1234567",
            country="Pakistan",
            city="Lahore",
            title="Platform Administrator",
            department="Operations",
            is_demo=True,
            created_at=dt("2026-01-05T09:00:00Z"),
        )
        admin2 = User(
            id=nid("admin-2"),
            username="fatima.noor",
            full_name="Fatima Noor",
            email="fatima.noor@company.com",
            password_hash=hash_password("Fatima@123"),
            role=Role.admin,
            status=AccountStatus.pending,
            country="Pakistan",
            city="Islamabad",
            title="Operations Admin",
            created_at=dt("2026-09-12T11:20:00Z"),
        )
        hr1 = User(
            id=nid("hr-1"),
            username="bilal.ahmed",
            full_name="Bilal Ahmed",
            email="hr@demo.com",
            password_hash=hash_password("Hr@123"),
            role=Role.hr,
            status=AccountStatus.approved,
            phone_number="+92 301 2223344",
            country="Pakistan",
            city="Lahore",
            title="Senior Talent Acquisition Specialist",
            department="Engineering Recruitment",
            auto_save_cv_bank_on_reject=False,
            is_demo=True,
            created_at=dt("2026-02-10T10:15:00Z"),
        )
        hr2 = User(
            id=nid("hr-2"),
            username="sara.malik",
            full_name="Sara Malik",
            email="sara.malik@company.com",
            password_hash=hash_password("Sara@123"),
            role=Role.hr,
            status=AccountStatus.approved,
            phone_number="+92 333 4455667",
            country="Pakistan",
            city="Karachi",
            title="HR Business Partner",
            department="Design & Product Recruitment",
            auto_save_cv_bank_on_reject=True,
            created_at=dt("2026-03-02T08:45:00Z"),
        )
        hr3 = User(
            id=nid("hr-3"),
            username="usman.tariq",
            full_name="Usman Tariq",
            email="usman.tariq@company.com",
            password_hash=hash_password("Usman@123"),
            role=Role.hr,
            status=AccountStatus.pending,
            country="Pakistan",
            city="Islamabad",
            title="HR Executive",
            created_at=dt("2026-09-10T13:05:00Z"),
        )
        db.add_all([admin1, admin2, hr1, hr2, hr3])
        await db.flush()

        db.add_all(
            [
                ApprovalEvent(
                    user_id=admin1.id,
                    action=ApprovalAction.approved,
                    by_user_id=None,
                    by_user_name="System",
                    note="Initial platform administrator account.",
                    created_at=dt("2026-01-05T09:00:00Z"),
                ),
                ApprovalEvent(
                    user_id=hr1.id,
                    action=ApprovalAction.approved,
                    by_user_id=admin1.id,
                    by_user_name=admin1.full_name,
                    note="Approved after HR onboarding interview.",
                    created_at=dt("2026-02-10T14:30:00Z"),
                ),
                ApprovalEvent(
                    user_id=hr2.id,
                    action=ApprovalAction.approved,
                    by_user_id=admin1.id,
                    by_user_name=admin1.full_name,
                    note="Approved -- referred by internal team.",
                    created_at=dt("2026-03-02T16:00:00Z"),
                ),
            ]
        )

        # ---------------------------------------------------------------
        # Jobs
        # ---------------------------------------------------------------
        job1 = Job(
            id=nid("job-1"),
            title="Senior Frontend Engineer",
            department="Engineering",
            location="Lahore, Pakistan (Hybrid)",
            description=(
                "We are looking for a Senior Frontend Engineer to lead the development of our "
                "customer-facing web applications. You will work closely with design and backend "
                "teams to build performant, accessible interfaces using React and TypeScript, "
                "mentor junior engineers, and help shape our frontend architecture. Strong "
                "experience with component-driven development, state management, and testing is "
                "required."
            ),
            seats=2,
            filled_seats=0,
            salary_min=250000,
            salary_max=350000,
            currency="PKR",
            status=JobStatus.open,
            assigned_hr_id=hr1.id,
            created_by_id=admin1.id,
            collect_github=True,
            is_demo=True,
            created_at=dt("2026-06-01T09:00:00Z"),
        )
        job2 = Job(
            id=nid("job-2"),
            title="Product Designer",
            department="Design",
            location="Remote",
            description=(
                "As a Product Designer you'll own end-to-end design for key product surfaces -- "
                "from research and wireframes to polished, production-ready UI. You'll collaborate "
                "with product managers and engineers daily, run usability sessions, and maintain "
                "consistency across our design system. Portfolio demonstrating shipped product "
                "work is required."
            ),
            seats=1,
            filled_seats=0,
            salary_min=200000,
            salary_max=280000,
            currency="PKR",
            status=JobStatus.open,
            assigned_hr_id=hr2.id,
            created_by_id=admin1.id,
            is_demo=True,
            created_at=dt("2026-07-15T09:00:00Z"),
        )
        job3 = Job(
            id=nid("job-3"),
            title="Backend Engineer (Node.js)",
            department="Engineering",
            location="Karachi, Pakistan (On-site)",
            description=(
                "We're hiring a Backend Engineer to design and maintain scalable REST/GraphQL "
                "APIs powering our platform. Responsibilities include database schema design, "
                "performance tuning, writing integration tests, and collaborating with DevOps on "
                "deployment pipelines. Experience with Node.js, PostgreSQL, and distributed "
                "systems is a strong plus."
            ),
            seats=3,
            filled_seats=1,
            salary_min=220000,
            salary_max=320000,
            currency="PKR",
            status=JobStatus.open,
            assigned_hr_id=hr1.id,
            created_by_id=admin1.id,
            collect_github=True,
            is_demo=True,
            created_at=dt("2026-08-01T09:00:00Z"),
        )
        job4 = Job(
            id=nid("job-4"),
            title="HR Coordinator",
            department="Human Resources",
            location="Islamabad, Pakistan (On-site)",
            description=(
                "Support the HR team with onboarding logistics, interview scheduling, and "
                "maintaining candidate records. Great entry point into talent acquisition for "
                "someone highly organized and detail-oriented."
            ),
            seats=1,
            filled_seats=0,
            salary_min=120000,
            salary_max=160000,
            currency="PKR",
            status=JobStatus.closed,
            assigned_hr_id=None,
            created_by_id=admin1.id,
            is_demo=True,
            created_at=dt("2026-05-01T09:00:00Z"),
        )
        db.add_all([job1, job2, job3, job4])
        await db.flush()

        # ---------------------------------------------------------------
        # Applicants
        # ---------------------------------------------------------------
        applicant_defs = [
            dict(
                slug="app-1", job=job1, name="Hassan Raza", email="hassan.raza@example.com",
                phone="+92 312 1112233", country="Pakistan", city="Lahore",
                applied="2026-08-20T10:00:00Z", experience=5,
                linkedin="https://linkedin.com/in/hassan-raza-demo",
                github="https://github.com/hassanraza-demo",
                summary=(
                    "5 years of experience building React/TypeScript applications. Led migration "
                    "of a legacy Angular app to React at previous company. Comfortable with "
                    "Next.js, testing (Jest/RTL), and design systems."
                ),
                cover_letter=(
                    "I'm excited about the opportunity to bring my frontend architecture "
                    "experience to your team and help scale your design system."
                ),
                stage=ApplicantStage.applied,
            ),
            dict(
                slug="app-2", job=job1, name="Emily Carter", email="emily.carter@example.com",
                phone="+1 415 555 0182", country="United States", city="San Francisco",
                applied="2026-08-22T10:00:00Z", experience=6,
                linkedin="https://linkedin.com/in/emilycarter-demo",
                github="https://github.com/emilycarter-demo",
                summary=(
                    "6+ years frontend engineering, specializing in performance optimization and "
                    "accessibility. Previously at a mid-size SaaS company leading a team of 4 "
                    "engineers."
                ),
                stage=ApplicantStage.interview_scheduled,
            ),
            dict(
                slug="app-3", job=job1, name="Ali Hamza", email="ali.hamza@example.com",
                phone="+92 321 9998877", country="Pakistan", city="Lahore",
                applied="2026-08-25T10:00:00Z", experience=3,
                linkedin="https://linkedin.com/in/ali-hamza-demo", github=None,
                summary=(
                    "3 years experience with React and Vue. Strong UI instincts, contributed to "
                    "several open-source component libraries."
                ),
                stage=ApplicantStage.assessment_passed,
            ),
            dict(
                slug="app-4", job=job1, name="Sana Iqbal", email="sana.iqbal@example.com",
                phone="+92 300 5556677", country="Pakistan", city="Karachi",
                applied="2026-08-27T10:00:00Z", experience=4,
                linkedin=None, github="https://github.com/saniqbal-demo",
                summary=(
                    "4 years of frontend development experience with a focus on design systems "
                    "and component libraries at a fintech startup."
                ),
                stage=ApplicantStage.rejected,
                rejection_note=(
                    "Good potential, but looking for stronger design-systems ownership "
                    "experience for this role."
                ),
                saved_to_cv_bank=True,
            ),
            dict(
                slug="app-5", job=job1, name="David Kim", email="david.kim@example.com",
                phone="+1 212 555 0143", country="United States", city="New York",
                applied="2026-08-29T10:00:00Z", experience=8,
                linkedin="https://linkedin.com/in/davidkim-demo",
                github="https://github.com/davidkim-demo",
                summary=(
                    "8 years experience, most recently as a Staff Frontend Engineer. Deep "
                    "expertise in micro-frontend architecture and build tooling."
                ),
                stage=ApplicantStage.applied,
            ),
            dict(
                slug="app-6", job=job2, name="Mahnoor Sheikh", email="mahnoor.sheikh@example.com",
                phone="+92 302 3334455", country="Pakistan", city="Karachi",
                applied="2026-07-20T10:00:00Z", experience=4,
                linkedin="https://linkedin.com/in/mahnoor-sheikh-demo", github=None,
                summary=(
                    "4 years of product design experience across fintech and e-commerce. Strong "
                    "Figma and design systems background."
                ),
                stage=ApplicantStage.assessment_passed,
            ),
            dict(
                slug="app-7", job=job2, name="Jonathan Lee", email="jonathan.lee@example.com",
                phone="+1 646 555 0129", country="United States", city="New York",
                applied="2026-07-24T10:00:00Z", experience=7,
                linkedin="https://linkedin.com/in/jonathanlee-demo",
                github="https://github.com/jonathanlee-demo",
                summary=(
                    "7 years of UX/UI design experience, led a design team of 3 at a Series B "
                    "startup. Published design case studies."
                ),
                stage=ApplicantStage.interview_scheduled,
            ),
            dict(
                slug="app-8", job=job2, name="Zara Farooq", email="zara.farooq@example.com",
                phone="+92 333 7778899", country="Pakistan", city="Islamabad",
                applied="2026-07-28T10:00:00Z", experience=2,
                linkedin=None, github=None,
                summary=(
                    "2 years of UI design experience. Freelance background working with "
                    "early-stage startups on brand and product design."
                ),
                stage=ApplicantStage.applied,
            ),
            dict(
                slug="app-9", job=job3, name="Omar Siddiqui", email="omar.siddiqui@example.com",
                phone="+92 345 1231234", country="Pakistan", city="Karachi",
                applied="2026-08-05T10:00:00Z", experience=5,
                linkedin="https://linkedin.com/in/omar-siddiqui-demo",
                github="https://github.com/omarsiddiqui-demo",
                summary=(
                    "5 years backend development with Node.js and PostgreSQL. Built and scaled "
                    "microservices handling millions of requests/day."
                ),
                stage=ApplicantStage.accepted,
            ),
            dict(
                slug="app-10", job=job3, name="Rachel Nguyen", email="rachel.nguyen@example.com",
                phone="+1 512 555 0111", country="United States", city="Austin",
                applied="2026-08-08T10:00:00Z", experience=6,
                linkedin="https://linkedin.com/in/rachelnguyen-demo",
                github="https://github.com/rachelnguyen-demo",
                summary=(
                    "6 years of backend and infrastructure engineering. Strong background in "
                    "distributed systems and event-driven architecture."
                ),
                stage=ApplicantStage.interview_scheduled,
            ),
            dict(
                slug="app-11", job=job3, name="Talha Mehmood", email="talha.mehmood@example.com",
                phone="+92 311 4567890", country="Pakistan", city="Rawalpindi",
                applied="2026-08-12T10:00:00Z", experience=2,
                linkedin=None, github="https://github.com/talhamehmood-demo",
                summary=(
                    "2 years of experience with Node.js and Express. Recently completed a "
                    "backend engineering bootcamp with a capstone e-commerce API project."
                ),
                stage=ApplicantStage.applied,
            ),
            dict(
                slug="app-12", job=job3, name="Grace Thompson", email="grace.thompson@example.com",
                phone="+44 20 7946 0192", country="United Kingdom", city="London",
                applied="2026-08-15T10:00:00Z", experience=4,
                linkedin="https://linkedin.com/in/gracethompson-demo", github=None,
                summary=(
                    "4 years backend engineering experience, with a focus on API design and "
                    "cloud infrastructure (AWS)."
                ),
                stage=ApplicantStage.rejected,
                rejection_note="Not enough hands-on distributed systems experience for this role.",
                saved_to_cv_bank=False,
            ),
        ]

        applicants: dict[str, Applicant] = {}
        for a in applicant_defs:
            file_name = f"{a['name'].replace(' ', '_')}_CV.txt"
            applicant = Applicant(
                id=nid(a["slug"]),
                job_id=a["job"].id,
                name=a["name"],
                email=a["email"],
                phone_number=a["phone"],
                country=a["country"],
                city=a["city"],
                linkedin_url=a["linkedin"],
                github_url=a["github"],
                experience_years=a["experience"],
                cv_file_name=file_name,
                cv_summary=a["summary"],
                cover_letter=a.get("cover_letter"),
                applied_date=dt(a["applied"]),
                stage=a["stage"],
                rejection_note=a.get("rejection_note"),
                saved_to_cv_bank=a.get("saved_to_cv_bank", False),
                is_demo=True,
            )

            cv_bytes = CV_BODY_TEMPLATE.format(name=a["name"], summary=a["summary"]).encode("utf-8")
            applicant.cv_object_key = upload_cv(cv_bytes, file_name, "text/plain")

            db.add(applicant)
            applicants[a["slug"]] = applicant

        await db.flush()

        # ---------------------------------------------------------------
        # Appointments
        # ---------------------------------------------------------------
        db.add_all(
            [
                Appointment(
                    id=nid("appt-1"),
                    applicant_id=applicants["app-2"].id,
                    job_id=job1.id,
                    hr_id=hr1.id,
                    scheduled_at=dt("2026-09-17T14:00:00Z"),
                    notify_day_before=True,
                    created_at=dt("2026-09-10T09:00:00Z"),
                ),
                Appointment(
                    id=nid("appt-2"),
                    applicant_id=applicants["app-7"].id,
                    job_id=job2.id,
                    hr_id=hr2.id,
                    scheduled_at=dt("2026-09-16T11:00:00Z"),
                    notify_day_before=False,
                    created_at=dt("2026-09-08T09:00:00Z"),
                ),
                Appointment(
                    id=nid("appt-3"),
                    applicant_id=applicants["app-10"].id,
                    job_id=job3.id,
                    hr_id=hr1.id,
                    scheduled_at=dt("2026-09-15T16:00:00Z"),
                    notify_day_before=True,
                    created_at=dt("2026-09-09T09:00:00Z"),
                ),
            ]
        )

        # ---------------------------------------------------------------
        # CV bank
        # ---------------------------------------------------------------
        sana = applicants["app-4"]
        db.add(
            CvBankEntry(
                id=nid("cv-1"),
                applicant_id=sana.id,
                name=sana.name,
                email=sana.email,
                phone_number=sana.phone_number,
                country=sana.country,
                city=sana.city,
                cv_object_key=copy_cv_to_bank(sana.cv_object_key) if sana.cv_object_key else None,
                cv_file_name=sana.cv_file_name,
                cv_summary=sana.cv_summary,
                experience_years=sana.experience_years,
                linkedin_url=sana.linkedin_url,
                github_url=sana.github_url,
                source_job_id=job1.id,
                source_job_title=job1.title,
                rejected_by_id=hr1.id,
                rejected_by_name=hr1.full_name,
                rejected_at=dt("2026-09-05T10:00:00Z"),
                note=(
                    "Good potential, but looking for stronger design-systems ownership "
                    "experience for this role."
                ),
                is_demo=True,
            )
        )

        await db.commit()
        print("Seed complete:")
        print(f"  Users: {len(applicant_defs) and 5}")
        print(f"  Jobs: 4")
        print(f"  Applicants: {len(applicant_defs)}")
        print(f"  Appointments: 3")
        print(f"  CV bank entries: 1")


if __name__ == "__main__":
    asyncio.run(seed())
