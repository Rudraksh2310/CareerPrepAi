"""
The shape of an interview: two rounds, each a list of TOPICS ("slots"), plus the controller that decides,
after every answer, whether Aria may probe the same topic again or must move on.

    Round 1  technical  topics from the job profile + the technologies the candidate should know
    Round 2  resume     one topic per experience, per project, plus education / certifications / achievements

Why code (not the LLM) owns this: left alone, a language model drifts - it keeps probing one topic, skips
resume items, or asks near-duplicates. Here the plan guarantees coverage (every topic gets a main question),
the budget guarantees length, and the LLM only decides *what to say* inside those rails.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field

from app.core.config import settings
from app.core.rag import infer_role_category

TECHNICAL = "technical"
RESUME = "resume"
ROUND_NAMES = {TECHNICAL: "Technical round", RESUME: "Resume round"}
ROUND_ORDER = [TECHNICAL, RESUME]


# --------------------------------------------------------------------------- slots & plan


@dataclass
class Slot:
    label: str  # shown to the user, e.g. "Python" or "Project: Smart Attendance System"
    kind: str  # skill | fundamentals | experience | project | education | certification | achievement | generic
    focus: str  # what the interviewer should find out about this topic
    keywords: list[str] = field(default_factory=list)  # concepts a good technical answer touches (offline scoring)
    openers: list[str] = field(default_factory=list)  # offline main questions
    facts: dict = field(default_factory=dict)  # resume facts for experience / project slots
    max_follow: int = 3  # hard cap of follow-ups on this topic

    def prompt(self) -> str:
        out = f"{self.label} ({self.kind}) - find out: {self.focus}"
        if self.facts:
            out += "\n    RESUME FACTS: " + _facts_text(self.facts)
        return out


def _facts_text(f: dict) -> str:
    bits = []
    for k in ("role", "company", "duration", "name", "description"):
        if f.get(k):
            bits.append(f"{k}={f[k]}")
    if f.get("technologies"):
        bits.append("tech=" + ", ".join(f["technologies"][:10]))
    if f.get("highlights"):
        bits.append("bullets=" + " | ".join(h[:160] for h in f["highlights"][:6]))
    if f.get("items"):
        bits.append("items=" + " | ".join(i[:120] for i in f["items"][:8]))
    return "; ".join(bits)


@dataclass
class RoundPlan:
    key: str
    name: str
    slots: list[Slot]
    budget: int  # total questions in this round (main questions + follow-ups)

    def info(self) -> dict:
        return {"key": self.key, "name": self.name, "max_questions": self.budget, "topics": [s.label for s in self.slots]}


@dataclass
class Plan:
    rounds: list[RoundPlan]
    level: str = "intermediate"  # basic | intermediate | advanced
    has_resume_items: bool = True
    interviewer_name: str = "Aria"  # set per request from the chosen character

    def round(self, key: str) -> RoundPlan:
        return next(r for r in self.rounds if r.key == key)

    @property
    def total(self) -> int:
        return sum(r.budget for r in self.rounds)

    def info(self) -> list[dict]:
        return [r.info() for r in self.rounds]


# --------------------------------------------------------------------------- technical topic bank

# key -> (label, focus, keywords, openers)
_SKILLS: dict[str, tuple[str, str, list[str], list[str]]] = {
    "python": ("Python", "core language depth: data structures, memory/GIL, generators, decorators, error handling, typing",
               ["list", "dict", "tuple", "generator", "decorator", "gil", "thread", "async", "exception", "mutable", "comprehension", "class"],
               ["To begin, in Python, what is the difference between a list and a tuple, and when would you pick each one?",
                "In Python, how do generators work, and why would you use one instead of building a full list?"]),
    "java": ("Java", "OOP, collections, JVM memory/GC, concurrency, exceptions",
             ["jvm", "garbage", "interface", "abstract", "hashmap", "thread", "synchronized", "heap", "stream", "exception", "immutable"],
             ["Let's talk Java. How does a HashMap work internally, and what happens when two keys land in the same bucket?",
              "Explain the difference between an abstract class and an interface in Java, and when you would use each."]),
    "javascript": ("JavaScript", "closures, scope, async/await and the event loop, prototypes, ES6+",
                   ["closure", "scope", "hoisting", "promise", "async", "await", "event loop", "callback", "prototype", "this", "const", "let"],
                   ["On JavaScript: what is a closure, and can you give me a practical situation where you used one?",
                    "How does the JavaScript event loop work, and where do promises fit into it?"]),
    "typescript": ("TypeScript", "type system, interfaces vs types, generics, narrowing, strictness",
                   ["interface", "type", "generic", "union", "any", "unknown", "strict", "narrowing", "enum", "compile"],
                   ["With TypeScript, what do you gain over plain JavaScript, and what is the difference between an interface and a type alias?"]),
    "react": ("React", "components, state vs props, hooks, rendering and re-render control, effects",
              ["state", "props", "hook", "useeffect", "usestate", "render", "virtual dom", "memo", "key", "context", "component", "effect"],
              ["On React: how do state and props differ, and what makes a component re-render?",
               "How does useEffect work, and what kind of bugs come from a wrong dependency array?"]),
    "node": ("Node.js", "event loop, non-blocking I/O, streams, middleware, error handling",
             ["event loop", "non-blocking", "async", "stream", "middleware", "express", "callback", "promise", "single thread", "worker"],
             ["Let's cover Node.js. How does Node handle many concurrent requests on a single thread?"]),
    "sql": ("SQL and databases", "joins, indexing, normalisation, transactions, query optimisation",
            ["join", "index", "primary key", "foreign key", "normaliz", "transaction", "acid", "group by", "explain", "constraint", "query plan"],
            ["Let's talk databases. What is an index, how does it speed up a query, and what does it cost you?",
             "Explain the different types of SQL joins, and tell me when you would use a LEFT JOIN."]),
    "mongodb": ("MongoDB", "document modelling, indexes, aggregation, when NoSQL beats SQL",
                ["document", "collection", "index", "aggregation", "embedding", "reference", "schema", "shard", "nosql"],
                ["With MongoDB, how do you decide between embedding documents and referencing them?"]),
    "redis": ("Redis and caching", "caching strategies, eviction, TTL, invalidation",
              ["cache", "ttl", "eviction", "invalidat", "lru", "write-through", "hit", "in-memory", "expire"],
              ["Where does caching with something like Redis help, and how do you deal with stale data?"]),
    "docker": ("Docker", "images vs containers, layers, Dockerfile practices, networking, compose",
               ["image", "container", "layer", "dockerfile", "volume", "compose", "network", "registry", "port", "isolation"],
               ["On Docker: what is the difference between an image and a container, and why do people care about image layers?"]),
    "kubernetes": ("Kubernetes", "pods, deployments, services, scaling, config and secrets",
                   ["pod", "deployment", "service", "scaling", "node", "configmap", "secret", "ingress", "replica", "probe"],
                   ["In Kubernetes, what are pods, deployments and services, and how do they relate to each other?"]),
    "aws": ("Cloud (AWS)", "core services, IAM, scaling, cost, deployment choices",
            ["ec2", "s3", "iam", "lambda", "rds", "vpc", "load balancer", "autoscal", "cloudwatch", "region"],
            ["On the cloud side: when would you use a serverless function versus a virtual machine, and what are the trade-offs?"]),
    "git": ("Git", "branching, merging vs rebasing, resolving conflicts, team workflow",
            ["branch", "merge", "rebase", "conflict", "commit", "pull request", "cherry", "stash", "revert", "history"],
            ["Tell me about Git. What is the difference between merge and rebase, and how do you resolve a conflict?"]),
    "rest": ("REST APIs", "resource design, HTTP methods and status codes, idempotency, versioning, auth, pagination",
             ["get", "post", "put", "idempot", "status code", "stateless", "resource", "versioning", "pagination", "json", "authentication"],
             ["Let's talk APIs. What makes an API RESTful, and what is the difference between PUT and PATCH?",
              "How would you design pagination and error handling for a REST API?"]),
    "python-web": ("Python web frameworks", "request lifecycle, ORM, validation, middleware, async vs sync",
                   ["route", "middleware", "orm", "request", "response", "validation", "async", "dependency", "serializer", "migration"],
                   ["With your Python web framework, how does a request travel from the client to your handler and back?"]),
    "spring": ("Spring", "dependency injection, beans, REST controllers, JPA, transactions",
               ["bean", "injection", "autowired", "controller", "jpa", "transaction", "annotation", "context", "repository"],
               ["In Spring, what is dependency injection and what problem does it solve?"]),
    "cpp": ("C++", "pointers/references, memory management, RAII, OOP, STL",
            ["pointer", "reference", "raii", "destructor", "virtual", "stl", "vector", "heap", "stack", "smart pointer", "template"],
            ["In C++, what is the difference between a pointer and a reference, and when does memory management bite you?"]),
    "html": ("HTML and CSS", "semantics, box model, flexbox/grid, responsive layout, accessibility",
             ["semantic", "box model", "flexbox", "grid", "responsive", "media query", "specificity", "accessib", "aria", "position"],
             ["On CSS: how do flexbox and grid differ, and how do you make a layout responsive?"]),
    "ml": ("Machine learning", "supervised vs unsupervised, overfitting, metrics, validation, feature engineering",
           ["overfit", "underfit", "bias", "variance", "precision", "recall", "cross", "validation", "feature", "regulari", "train", "test"],
           ["In machine learning, what is overfitting, how do you detect it, and what do you do about it?",
            "Which evaluation metrics would you use for an imbalanced classification problem, and why?"]),
    "pandas": ("Data analysis with pandas", "cleaning, groupby/merge, missing data, vectorisation",
               ["dataframe", "groupby", "merge", "null", "missing", "apply", "vectoriz", "index", "pivot", "outlier"],
               ["With pandas, how would you handle missing values and duplicates in a messy dataset?"]),
    "linux": ("Linux and the command line", "processes, permissions, networking, debugging a server",
              ["process", "permission", "chmod", "grep", "pipe", "ssh", "log", "systemd", "port", "kill"],
              ["On Linux, how would you find out why a service on a server is slow or has crashed?"]),
}

_ALIASES = {
    "python": "python", "py": "python", "java": "java", "javascript": "javascript", "js": "javascript", "es6": "javascript",
    "typescript": "typescript", "ts": "typescript", "react": "react", "reactjs": "react", "react.js": "react", "next.js": "react", "nextjs": "react",
    "node": "node", "nodejs": "node", "node.js": "node", "express": "node", "expressjs": "node",
    "sql": "sql", "postgresql": "sql", "postgres": "sql", "mysql": "sql", "sqlite": "sql", "oracle": "sql", "database": "sql", "rdbms": "sql",
    "mongodb": "mongodb", "mongo": "mongodb", "nosql": "mongodb", "redis": "redis", "cache": "redis", "caching": "redis",
    "docker": "docker", "kubernetes": "kubernetes", "k8s": "kubernetes",
    "aws": "aws", "azure": "aws", "gcp": "aws", "cloud": "aws", "git": "git", "github": "git",
    "rest": "rest", "api": "rest", "restful": "rest", "graphql": "rest", "microservices": "rest",
    "fastapi": "python-web", "flask": "python-web", "django": "python-web",
    "spring": "spring", "spring boot": "spring", "springboot": "spring",
    "c++": "cpp", "cpp": "cpp", "html": "html", "css": "html", "tailwind": "html",
    "machine learning": "ml", "ml": "ml", "deep learning": "ml", "tensorflow": "ml", "pytorch": "ml", "scikit-learn": "ml", "sklearn": "ml",
    "pandas": "pandas", "numpy": "pandas", "linux": "linux", "bash": "linux",
}

# role-category fundamentals: (label, focus, keywords, openers)
_FUNDAMENTALS: dict[str, list[tuple[str, str, list[str], list[str]]]] = {
    "backend": [
        ("Data structures and algorithms", "complexity, choosing the right structure, problem-solving approach",
         ["time complexity", "o(n", "hash", "array", "tree", "graph", "sort", "binary search", "stack", "queue", "recursion"],
         ["Say you need to check whether a list of a million user IDs contains duplicates. How would you do it, and what is the time and memory cost?",
          "When would you choose a hash map over a sorted array, and what are the trade-offs?"]),
        ("System design and scalability", "scaling reads/writes, load balancing, caching, bottlenecks, trade-offs",
         ["load balanc", "cache", "scal", "horizontal", "database", "queue", "latency", "replica", "shard", "bottleneck", "throughput"],
         ["Imagine an API that suddenly gets ten times more traffic. Walk me through how you would find the bottleneck and scale it.",
          "How would you design a URL shortener? Start with the main components."]),
        ("Authentication and security", "sessions vs tokens, hashing, OWASP basics, injection, CORS",
         ["jwt", "token", "hash", "salt", "session", "oauth", "injection", "xss", "csrf", "cors", "https", "bcrypt"],
         ["How would you store user passwords and authenticate API requests securely?",
          "What is SQL injection, and how do you prevent it?"]),
        ("Concurrency and performance", "threads/async, race conditions, locks, profiling",
         ["thread", "async", "race condition", "lock", "deadlock", "profil", "blocking", "parallel", "concurrent", "queue"],
         ["What is a race condition, and how would you prevent one in a web service?"]),
    ],
    "frontend": [
        ("JavaScript fundamentals", "closures, async, event loop, this, equality, scope",
         ["closure", "scope", "promise", "async", "event loop", "this", "hoisting", "prototype", "callback"],
         ["What happens in the browser between typing a URL and seeing a rendered page? Cover what you know of the JavaScript side.",
          "Explain how promises and async/await differ from callbacks."]),
        ("Frontend performance", "rendering, bundle size, lazy loading, Core Web Vitals, caching",
         ["lazy", "bundle", "render", "lcp", "cls", "debounce", "memo", "cache", "cdn", "code splitting", "reflow"],
         ["A page feels slow on a mid-range phone. How would you diagnose and improve it?"]),
        ("State management and architecture", "local vs global state, data fetching, component design",
         ["state", "context", "redux", "props", "lift", "fetch", "cache", "component", "reducer", "side effect"],
         ["How do you decide where state should live in a frontend application?"]),
        ("Accessibility and testing", "semantic HTML, ARIA, keyboard use, unit/e2e testing",
         ["aria", "semantic", "keyboard", "screen reader", "contrast", "unit test", "jest", "e2e", "snapshot", "focus"],
         ["How do you make a web page usable for someone who navigates only by keyboard or screen reader?"]),
    ],
    "data": [
        ("Statistics and probability", "distributions, hypothesis tests, bias, correlation vs causation",
         ["mean", "median", "variance", "distribution", "p-value", "hypothesis", "correlation", "causation", "sample", "bias", "confidence"],
         ["What is a p-value, and what is a common way people misread it?",
          "Explain the difference between correlation and causation with an example."]),
        ("Model building and evaluation", "overfitting, metrics, validation, imbalance, feature engineering",
         ["overfit", "cross", "validation", "precision", "recall", "f1", "auc", "feature", "regulari", "imbalance", "baseline"],
         ["How do you decide whether a model is good enough, and which metrics would you look at?"]),
        ("SQL and data wrangling", "joins, window functions, aggregation, cleaning",
         ["join", "group by", "window", "aggregate", "null", "duplicate", "clean", "index", "cte", "subquery"],
         ["Given an orders table and a customers table, how would you find the top five customers by revenue last month?"]),
        ("Data pipelines and deployment", "ETL, scheduling, monitoring, drift, reproducibility",
         ["etl", "pipeline", "airflow", "schedule", "drift", "monitor", "reproduc", "version", "batch", "api"],
         ["Once a model works in a notebook, what has to happen before it is safe to run in production?"]),
    ],
    "general": [
        ("Data structures and algorithms", "complexity, choosing a structure, problem-solving approach",
         ["time complexity", "hash", "array", "tree", "graph", "sort", "search", "stack", "queue", "recursion", "o(n"],
         ["How would you find the two numbers in a list that add up to a target, and what is the complexity of your approach?",
          "When is a linked list better than an array, and when is it worse?"]),
        ("Object-oriented design", "encapsulation, inheritance vs composition, SOLID, design patterns",
         ["encapsulation", "inheritance", "polymorphism", "abstraction", "composition", "solid", "interface", "pattern", "coupling"],
         ["What is the difference between inheritance and composition, and which do you prefer and why?"]),
        ("Databases and storage", "relational modelling, indexes, transactions, SQL vs NoSQL",
         ["index", "join", "transaction", "acid", "normaliz", "primary key", "sql", "nosql", "query"],
         ["How would you model a simple library system in a database, and which indexes would you add?"]),
        ("Testing and debugging", "unit tests, reproducing bugs, logging, systematic debugging",
         ["unit test", "reproduc", "log", "breakpoint", "regression", "mock", "integration", "root cause", "assert"],
         ["Tell me how you debug a bug that only happens in production and not on your laptop."]),
    ],
}
_FUNDAMENTALS["fullstack"] = _FUNDAMENTALS["backend"]

_GENERIC_SKILL_OPENERS = [
    "Let's talk about {s}. How would you explain it to a teammate who has never used it, and when would you choose it over the alternatives?",
    "You list {s} on your profile. What are the core concepts someone must understand to use {s} well?",
]


_PRIORITY = {
    "backend": ["python", "java", "node", "python-web", "spring", "sql", "rest", "redis", "mongodb", "docker", "aws", "kubernetes", "cpp", "git", "linux"],
    "frontend": ["javascript", "react", "typescript", "html", "node", "rest", "git"],
    "data": ["python", "sql", "pandas", "ml", "aws", "git"],
    "general": ["python", "java", "cpp", "javascript", "sql", "git"],
}


def _skill_key(skill: str) -> str | None:
    s = re.sub(r"\s+", " ", skill.lower().strip())
    if s in _ALIASES:
        return _ALIASES[s]
    for alias, key in _ALIASES.items():
        if len(alias) > 3 and alias in s:
            return key
    return None


def _level(resume_data: dict) -> str:
    lv = (resume_data.get("experience_level") or "").lower()
    if re.search(r"student|fresher|entry|intern|junior|graduate|beginner|trainee", lv):
        return "basic"
    if re.search(r"senior|lead|principal|staff|expert|10\+|8\+|architect", lv):
        return "advanced"
    return "intermediate"


def _technical_slots(role: str, resume_data: dict, n: int) -> list[Slot]:
    category = infer_role_category(role)
    wanted: list[tuple[str, str | None]] = []  # (bank key, original skill text)
    seen: set[str] = set()

    def add(key: str | None, raw: str | None):
        if key and key not in seen:
            seen.add(key)
            wanted.append((key, raw))

    # technologies named in the role title come first ("React Developer", "Java Backend Engineer")
    for token in re.findall(r"[A-Za-z+#.]+", role or ""):
        add(_skill_key(token), token)
    for sk in resume_data.get("key_skills") or []:
        add(_skill_key(str(sk)), str(sk))
    if category == "data":
        add("sql", "SQL")

    # order the candidate's technologies by how central they are to this kind of role (stable for ties)
    prio = _PRIORITY.get(category, [])
    wanted.sort(key=lambda kv: prio.index(kv[0]) if kv[0] in prio else len(prio))

    fundamentals = list(_FUNDAMENTALS.get(category, _FUNDAMENTALS["general"]))
    n_skill = min(len(wanted), max(1, n // 2)) if wanted else 0
    n_fund = max(0, n - n_skill)
    if n_fund > len(fundamentals):
        n_skill = min(len(wanted), n - len(fundamentals))
        n_fund = min(len(fundamentals), n - n_skill)

    skills = []
    for key, raw in wanted[:n_skill]:
        label, focus, kws, openers = _SKILLS[key]
        skills.append(Slot(label=label, kind="skill", focus=focus, keywords=kws, openers=openers, max_follow=settings.max_followups_per_topic))
    funds = [
        Slot(label=l, kind="fundamentals", focus=f, keywords=k, openers=o, max_follow=settings.max_followups_per_topic)
        for l, f, k, o in fundamentals[:n_fund]
    ]
    # candidate's own tech first (comfortable start), then alternate with fundamentals
    ordered: list[Slot] = []
    for i in range(max(len(skills), len(funds))):
        if i < len(skills):
            ordered.append(skills[i])
        if i < len(funds):
            ordered.append(funds[i])
    return ordered[:n]


# --------------------------------------------------------------------------- resume topics


def _resume_slots(resume_data: dict, role: str) -> list[Slot]:
    slots: list[Slot] = []
    for e in resume_data.get("experience") or []:
        if not isinstance(e, dict):
            continue
        bits = [b for b in (e.get("role"), e.get("company")) if b]
        label = "Experience: " + (" at ".join(bits) if len(bits) == 2 else (bits[0] if bits else "previous role"))
        slots.append(Slot(
            label=label, kind="experience", facts=dict(e),
            focus="their responsibilities, the tools and technologies used, a concrete achievement, a challenge they handled, their own contribution vs the team's, and what they learned",
            max_follow=settings.max_followups_per_topic,
        ))
    projects = resume_data.get("projects") or []
    if not projects:  # older resumes only stored project names
        projects = [{"name": p} for p in (resume_data.get("notable_projects") or [])]
    for p in projects:
        if not isinstance(p, dict) or not p.get("name"):
            continue
        slots.append(Slot(
            label=f"Project: {p['name']}", kind="project", facts=dict(p),
            focus="the problem it solved, their own role, the architecture and tech choices (and why), the hardest bug or trade-off, how they tested it, the outcome and what they would change",
            max_follow=settings.max_followups_per_topic,
        ))
    edu = [str(x) for x in resume_data.get("education") or []]
    if edu:
        slots.append(Slot(label="Education", kind="education", facts={"items": edu},
                          focus="relevant coursework, academic projects, what they enjoyed most or found hardest", max_follow=1))
    certs = [str(x) for x in resume_data.get("certifications") or []]
    if certs:
        slots.append(Slot(label="Certifications", kind="certification", facts={"items": certs},
                          focus="what they learned from the certifications and how they applied it", max_follow=1))
    ach = [str(x) for x in resume_data.get("achievements") or []]
    if ach:
        slots.append(Slot(label="Achievements and activities", kind="achievement", facts={"items": ach},
                          focus="the achievement they are proudest of, their role in it, leadership or teamwork shown", max_follow=1))
    return slots


def _generic_resume_slots(role: str) -> list[Slot]:
    """No resume (or nothing parsable): still run a background round so the interview has both rounds."""
    mk = lambda label, kind, focus: Slot(label=label, kind="generic", focus=focus, max_follow=2)  # noqa: E731
    return [
        mk("Your most significant project", "generic", "what it was, their role, technologies, challenges, outcome"),
        mk("Previous experience", "generic", "any internship, job, freelance or volunteer work, responsibilities and learnings"),
        mk("A hard problem you solved", "generic", "how they approached an obstacle and what they learned"),
        mk("Teamwork and motivation", "generic", f"how they work with others and why they want this {role} role"),
    ]


# --------------------------------------------------------------------------- build


def build_plan(role: str, company: str | None, resume) -> Plan:
    data = (getattr(resume, "parsed_data", None) or {}) if resume is not None else {}
    n_topics = max(2, settings.technical_topics)
    tech_slots = _technical_slots(role, data, n_topics)
    tech_budget = max(len(tech_slots), settings.technical_questions)

    res_slots = _resume_slots(data, role)
    has_items = bool(res_slots)
    if not res_slots:
        res_slots = _generic_resume_slots(role)
    # The resume round has exactly `resume_max_questions` questions. Items come in priority order (experience, projects,
    # education, ...); with more items than questions the later ones are left out, with fewer the spare questions go to
    # follow-ups on the items that exist.
    res_budget = max(1, settings.resume_max_questions)
    res_slots = res_slots[:res_budget]
    res_budget = min(res_budget, sum(1 + s.max_follow for s in res_slots))  # never promise more than the topics can yield

    return Plan(
        rounds=[
            RoundPlan(TECHNICAL, ROUND_NAMES[TECHNICAL], tech_slots, tech_budget),
            RoundPlan(RESUME, ROUND_NAMES[RESUME], res_slots, res_budget),
        ],
        level=_level(data),
        has_resume_items=has_items,
    )


# --------------------------------------------------------------------------- controller


@dataclass
class Directive:
    """What the engine must do next, decided by code from the plan and the history."""
    opening: bool = False
    round_key: str = TECHNICAL
    slot: Slot | None = None  # topic of the question just answered
    next_slot: Slot | None = None  # topic of the next MAIN question (None = interview over)
    next_round_key: str | None = None
    round_changes: bool = False  # next_slot belongs to a new round
    follow_allowed: bool = False
    followups_in_slot: int = 0
    round_asked: int = 0
    round_budget: int = 0
    covered: list[str] = field(default_factory=list)
    remaining: list[str] = field(default_factory=list)


def _rk(h: dict) -> str:
    return h.get("round") or TECHNICAL


def locate(plan: Plan, history: list[dict], force_next_round: bool = False) -> Directive:
    if not history:
        first = plan.rounds[0].slots[0]
        return Directive(opening=True, round_key=TECHNICAL, next_slot=first, next_round_key=TECHNICAL,
                         round_budget=plan.rounds[0].budget, remaining=[s.label for s in plan.rounds[0].slots])

    last = history[-1]
    rkey = _rk(last)
    rp = plan.round(rkey)
    in_round = [h for h in history if _rk(h) == rkey]
    labels = [s.label for s in rp.slots]
    cur_label = last.get("topic")
    cur_idx = labels.index(cur_label) if cur_label in labels else -1
    cur = rp.slots[cur_idx] if cur_idx >= 0 else None

    asked = len(in_round)
    budget_left = rp.budget - asked
    untouched = rp.slots[cur_idx + 1:] if budget_left > 0 else []
    r = len(untouched)
    spare = budget_left - r
    followups = sum(1 for h in in_round if h.get("topic") == cur_label and h.get("is_followup"))

    follow_allowed = False
    if cur is not None and spare >= 1 and followups < cur.max_follow and followups < settings.max_followups_per_topic:
        # `spare` is what is left after every untouched topic gets its one question. Follow-ups this topic already used came
        # out of the same pool, so share (spare + used) between this topic and the r untouched ones; the last topic of a
        # round (r == 0) may therefore use every remaining question.
        fair_share = max(1, math.ceil((spare + followups) / (r + 1)))
        follow_allowed = followups < fair_share

    next_slot, next_round, changes = None, None, False
    if untouched:
        next_slot, next_round = untouched[0], rkey
    else:
        i = ROUND_ORDER.index(rkey)
        if i + 1 < len(ROUND_ORDER):
            nxt = plan.round(ROUND_ORDER[i + 1])
            next_slot, next_round, changes = nxt.slots[0], nxt.key, True

    if force_next_round:  # candidate chose to skip ahead: next question opens the next round, no follow-ups
        follow_allowed = False
        next_slot, next_round, changes = None, None, False
        i = ROUND_ORDER.index(rkey)
        if i + 1 < len(ROUND_ORDER):
            nxt = plan.round(ROUND_ORDER[i + 1])
            next_slot, next_round, changes = nxt.slots[0], nxt.key, True
        untouched = []

    return Directive(
        round_key=rkey, slot=cur, next_slot=next_slot, next_round_key=next_round, round_changes=changes,
        follow_allowed=follow_allowed, followups_in_slot=followups, round_asked=asked, round_budget=rp.budget,
        covered=[s.label for s in rp.slots[: max(cur_idx, 0) + 1]] if cur_idx >= 0 else [],
        remaining=[s.label for s in untouched],
    )
