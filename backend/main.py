import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import get_pool, close_pool, CREATE_TABLE_SQL
from proxy import router as proxy_router
from analytics import router as analytics_router
from seed import seed_if_empty


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool = await get_pool()
    await pool.execute(CREATE_TABLE_SQL)
    await seed_if_empty(pool)
    yield
    await close_pool()


app = FastAPI(title="LLM Observatory", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(proxy_router)
app.include_router(analytics_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
