import { Reverter } from "@/test/helpers/reverter";
import {
  AbstractStrategy,
  Beacon,
  ERC20Mock,
  Registry,
  StrategyMock,
  ThirdPartyProtocolMock,
  Vault,
} from "@/typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { afterEach } from "mocha";
import { expect } from "chai";

describe("AbstractStrategy", () => {
  const reverter = new Reverter();
  const initialProtocolBalance = 100n ** 18n;

  let registry: Registry;
  let vaultProxy: Vault;
  let beacon: Beacon;
  let strategy: StrategyMock;
  let externalProtocol: ThirdPartyProtocolMock;

  let asset: ERC20Mock;
  let want1: ERC20Mock;

  let OWNER: HardhatEthersSigner;
  let BOB: HardhatEthersSigner;
  let ALICE: HardhatEthersSigner;
  let TREASURY: HardhatEthersSigner;

  before(async () => {
    [OWNER, BOB, ALICE, TREASURY] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("Registry");
    const Vault = await ethers.getContractFactory("Vault");
    const Strategy = await ethers.getContractFactory("StrategyMock");
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const Beacon = await ethers.getContractFactory("Beacon");
    const THPP = await ethers.getContractFactory("ThirdPartyProtocolMock");

    const vaultImpl = await Vault.deploy();
    beacon = await Beacon.deploy(vaultImpl.target, OWNER);
    registry = await Registry.deploy(beacon.target, OWNER, TREASURY);

    asset = await ERC20Mock.deploy("asset", "AST", 18);
    want1 = await ERC20Mock.deploy("want1", "W1", 18);

    externalProtocol = await THPP.deploy(asset.target);

    await asset.mint(externalProtocol.target, initialProtocolBalance);

    strategy = await Strategy.deploy(
      externalProtocol.target,
      [asset.target, want1.target],
      OWNER.address,
      registry.target,
    );

    const proxy = await registry.deployVault.staticCall(asset.target, "Vault", "VLT", 10n ** 25n, 10n ** 26n);
    await registry.deployVault(asset.target, "Vault", "VLT", 10n ** 25n, 10n ** 26n);
    vaultProxy = await ethers.getContractAt("Vault", proxy);

    await registry.registerStrategy(strategy.target);

    await asset.mint(ALICE.address, 100n * 10n ** 18n);
    await asset.mint(BOB.address, 100n * 10n ** 18n);
    await asset.connect(ALICE).approve(vaultProxy.target, 100n * 10n ** 18n);
    await asset.connect(BOB).approve(vaultProxy.target, 100n * 10n ** 18n);

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("addVault", () => {
    it("should add vault", async () => {
      await registry.injectStrategy(asset.target, 0, 0);

      expect(await vaultProxy.getStrategies()).to.be.deep.eq([strategy.target]);
      expect(await strategy.vaults()).to.be.deep.eq([vaultProxy.target]);
    });

    it("should revert if caller not registry", async () => {
      await expect(strategy.addVault(vaultProxy.target)).to.be.revertedWith("Vault: caller not registry");
    });
  });

  describe("deposit", () => {
    beforeEach(async () => {
      await registry.injectStrategy(asset.target, 0, 0);
      await vaultProxy.setStrategiesPercents([strategy.target], [10n ** 27n], [0n], false);
    });

    it("should deposit", async () => {
      await vaultProxy.connect(ALICE).deposit(10n ** 18n, ALICE.address);

      expect(await asset.balanceOf(strategy.target)).to.be.eq(0n);
      expect(await asset.balanceOf(externalProtocol.target)).to.be.eq(10n ** 18n + initialProtocolBalance);
    });

    it("should deposit while strategy part reached", async () => {
      await vaultProxy.connect(ALICE).deposit(10n ** 18n, ALICE.address);

      expect(await asset.balanceOf(strategy.target)).to.be.eq(0n);
      expect(await asset.balanceOf(externalProtocol.target)).to.be.eq(10n ** 18n + initialProtocolBalance);

      await vaultProxy.connect(ALICE).deposit(10n ** 18n, ALICE.address);

      expect(await asset.balanceOf(strategy.target)).to.be.eq(0n);
      expect(await asset.balanceOf(externalProtocol.target)).to.be.eq(2n * 10n ** 18n + initialProtocolBalance);
    });

    it("should revert if deposit zero", async () => {
      await vaultProxy.setStrategiesPercents([strategy.target], [10n], [0n], false);

      await expect(vaultProxy.connect(ALICE).deposit(0n, ALICE.address)).to.be.revertedWith("Strategy: zero amount");
    });

    it("should revert if paused", async () => {
      await strategy.pause();

      await expect(vaultProxy.connect(ALICE).deposit(10n ** 18n, ALICE.address)).to.be.revertedWithCustomError(
        strategy,
        "EnforcedPause",
      );
    });

    it("should revert if caller not vault", async () => {
      await expect(strategy.connect(ALICE).deposit(10n ** 18n, asset.target)).to.be.revertedWith(
        "Strategy: caller not vault",
      );
    });
  });

  describe("withdraw", () => {
    beforeEach(async () => {
      await registry.injectStrategy(asset.target, 0, 0);
      await vaultProxy.setStrategiesPercents([strategy.target], [10n ** 27n], [0n], false);
    });

    it("should withdraw", async () => {
      await vaultProxy.connect(ALICE).deposit(10n ** 18n, ALICE.address);
      expect(await asset.balanceOf(strategy.target)).to.be.eq(0n);
      expect(await asset.balanceOf(externalProtocol.target)).to.be.eq(10n ** 18n + initialProtocolBalance);

      await vaultProxy.connect(ALICE).withdraw(10n ** 18n, ALICE.address, ALICE.address);
      expect(await asset.balanceOf(strategy.target)).to.be.eq(0n);
    });

    it("should revert if withdrawn zero", async () => {
      await vaultProxy.connect(ALICE).deposit(10n ** 18n, ALICE.address);
      await vaultProxy.setStrategiesPercents([strategy.target], [10n], [0n], false);

      await expect(vaultProxy.connect(ALICE).withdraw(0n, ALICE.address, ALICE.address)).to.be.revertedWith(
        "Strategy: zero amount",
      );
    });

    it("should revert if paused", async () => {
      await vaultProxy.connect(ALICE).deposit(10n ** 18n, ALICE.address);
      await strategy.pause();

      await expect(
        vaultProxy.connect(ALICE).withdraw(10n ** 18n, ALICE.address, ALICE.address),
      ).to.be.revertedWithCustomError(strategy, "EnforcedPause");
    });

    it("should revert if caller not vault", async () => {
      await expect(strategy.connect(ALICE).withdraw(10n ** 18n, asset.target)).to.be.revertedWith(
        "Strategy: caller not vault",
      );
    });
  });

  describe("harvest", () => {
    beforeEach(async () => {
      await registry.injectStrategy(asset.target, 0, 0);
      await vaultProxy.setStrategiesPercents([strategy.target], [10n ** 27n], [0n], false);
    });

    it("should harvest", async () => {
      await vaultProxy.connect(ALICE).deposit(10n ** 18n, ALICE.address);

      const balanceBefore = await asset.balanceOf(BOB.address);

      await vaultProxy.connect(BOB).earn();

      expect(await asset.balanceOf(BOB.address)).to.be.eq(balanceBefore + 2n * 10n ** 17n);
      expect(await asset.balanceOf(TREASURY.address)).to.be.eq(2n * 10n ** 16n);
    });

    it("should revert if paused", async () => {
      await strategy.pause();

      await expect(vaultProxy.connect(ALICE).earn()).to.be.revertedWithCustomError(strategy, "EnforcedPause");
    });
  });

  describe("yieldHarvest", () => {
    beforeEach(async () => {
      await registry.injectStrategy(asset.target, 0, 0);
      await vaultProxy.setStrategiesPercents([strategy.target], [10n ** 27n], [0n], false);
    });

    it("should harvest as yield service", async () => {
      await strategy.grantRole(await strategy.YIELD_SERVICE_ROLE(), BOB.address);

      await vaultProxy.connect(ALICE).deposit(10n ** 18n, ALICE.address);
      expect(await strategy.balanceOf(asset.target)).to.be.eq(10n ** 18n);

      const balanceBefore = await asset.balanceOf(BOB.address);
      let strategyBalance = await strategy.balanceOf(asset.target);

      await strategy.connect(BOB).yieldHarvest();

      expect(await asset.balanceOf(BOB.address)).to.be.eq(balanceBefore);
      expect(await asset.balanceOf(TREASURY.address)).to.be.eq(0);
      expect(await strategy.balanceOf(asset.target)).to.be.eq(strategyBalance * 2n + 10n ** 18n);

      strategyBalance = await strategy.balanceOf(asset.target);
      await strategy.connect(BOB).yieldHarvest();

      expect(await asset.balanceOf(BOB.address)).to.be.eq(balanceBefore);
      expect(await asset.balanceOf(TREASURY.address)).to.be.eq(0);
      expect(await strategy.balanceOf(asset.target)).to.be.eq(strategyBalance * 2n + 10n ** 18n);
    });

    it("should revert if caller not yield service role", async () => {
      await expect(strategy.yieldHarvest()).to.be.revertedWithCustomError(strategy, "AccessControlUnauthorizedAccount");
    });

    it("should revert if paused", async () => {
      await strategy.pause();
      await expect(strategy.yieldHarvest()).to.be.revertedWithCustomError(strategy, "EnforcedPause");
    });
  });

  describe("panic", () => {
    it("should panic", async () => {
      await strategy.panic();
      expect(await strategy.paused()).to.be.true;
    });

    it("should revert if caller not owner", async () => {
      await expect(strategy.connect(ALICE).panic()).to.be.revertedWithCustomError(
        strategy,
        "AccessControlUnauthorizedAccount",
      );
    });
  });

  describe("pause", () => {
    it("should pause", async () => {
      await strategy.pause();

      expect(await strategy.paused()).to.be.true;
    });

    it("should pause", async () => {
      await expect(strategy.connect(ALICE).pause()).to.be.revertedWithCustomError(
        strategy,
        "AccessControlUnauthorizedAccount",
      );
    });
  });

  describe("unpause", () => {
    it("should unpause", async () => {
      await strategy.pause();
      await strategy.unpause();

      expect(await strategy.paused()).to.be.false;
    });

    it("should revert if caller not owner", async () => {
      await expect(strategy.connect(ALICE).unpause()).to.be.revertedWithCustomError(
        strategy,
        "AccessControlUnauthorizedAccount",
      );
    });
  });

  describe("balancesOfWants", () => {
    it("should return balances", async () => {
      await registry.injectStrategy(asset.target, 0, 0);
      await vaultProxy.setStrategiesPercents([strategy.target], [10n ** 27n], [0n], false);

      await vaultProxy.connect(ALICE).deposit(10n ** 18n, ALICE.address);

      const balances = await strategy.balancesOfWants();

      expect(balances).to.be.deep.eq([0n, 0n]);
    });
  });
});
