import { Router, type IRouter } from "express";
import healthRouter from "./health";
import genomicsRouter from "./genomics";
import proteinRouter from "./protein";
import crisprRouter from "./crispr";
import nlpRouter from "./nlp";
import genomeBrowserRouter from "./genome-browser";
import limsRouter from "./lims";
import drugsRouter from "./drugs";
import transcriptomicsRouter from "./transcriptomics";
import searchRouter from "./search";

const router: IRouter = Router();

router.use(healthRouter);
router.use(searchRouter);
router.use(genomicsRouter);
router.use(proteinRouter);
router.use(crisprRouter);
router.use(nlpRouter);
router.use(genomeBrowserRouter);
router.use(limsRouter);
router.use(drugsRouter);
router.use(transcriptomicsRouter);

export default router;
