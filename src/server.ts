import * as bodyParser from "body-parser";
import * as cors from "cors";
import { GraphQLServer } from "graphql-yoga";
import { defaultErrorFormatter } from "graphql-yoga/dist/defaultErrorFormatter";
import { join } from "path";
import { resolvers } from "./api";
import { notify } from "./exceptionManager";
import {
  authenticateController,
  authenticateControllerV2,
  authorizationMiddleware,
  configureFirstTimeSettings,
  filterDirTraversal,
  logMiddleware,
  resolveRepoFromId
} from "./middlewares";

export type onAddRepoRequestHandler = (fullpath: string) => Promise<boolean>;

interface StartOptions {
  accessToken?: string;
  userId?: string;
  userSite?: string;
  port?: number;
  firstTimeLaunch?: boolean;
  onAddRepoRequest?: onAddRepoRequestHandler;
}

const defaultOptions: StartOptions = {
  port: 44512
};

export const start = (options: StartOptions): Promise<any> => {
  const startedAt = new Date();
  const settings = { ...options, ...defaultOptions };
  const typeDefs = join(__dirname, `../graphql/schema.graphql`);

  const reconfigure = (id: string, site: string) => {
    settings.userId = id;
    settings.userSite = site;
  };

  const server = new GraphQLServer({
    resolvers,
    typeDefs,
    context: () => ({ onAddRepoRequest: settings.onAddRepoRequest }),
    middlewares: [logMiddleware, resolveRepoFromId, filterDirTraversal],
  });

  server.express.use(cors());
  server.express.use(bodyParser.json());
  server.express.post("/configure", configureFirstTimeSettings(settings.firstTimeLaunch, startedAt, reconfigure));
  // indicates that the authorization v2 feature is available (automatic)
  server.express.get("/authorize/v2", (req, res) => res.status(200).send("AVAILABLE"));
  server.express.post("/authorize/v2", authenticateControllerV2(settings));
  // indicates that the authorization feature is available
  server.express.get("/authorize/", (req, res) => res.status(200).send("AVAILABLE"));
  server.express.post("/authorize/:env", authenticateController(settings.accessToken, settings.userId));

  server.express.use(authorizationMiddleware(settings.accessToken));
  // tslint:disable-next-line:no-console
  return server.start({ port: settings.port, formatError: (errors: any) => {
    notify(`Explorook returned graphql errors to client: ${errors}`, { metaData: { errors }} );
    return defaultErrorFormatter(errors);
  }}, (opts: { port: number }) => console.log(`Server is running on http://localhost:${opts.port}`));
};

