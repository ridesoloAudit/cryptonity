pragma solidity ^0.4.23;

import "openzeppelin-solidity/contracts/crowdsale/validation/CappedCrowdsale.sol";
import "openzeppelin-solidity/contracts/crowdsale/validation/WhitelistedCrowdsale.sol";
import "openzeppelin-solidity/contracts/crowdsale/validation/TimedCrowdsale.sol";
import "openzeppelin-solidity/contracts/crowdsale/distribution/RefundableCrowdsale.sol";
import "openzeppelin-solidity/contracts/crowdsale/distribution/PostDeliveryCrowdsale.sol";
import "openzeppelin-solidity/contracts/lifecycle/Pausable.sol";
import "../token/CryptonityToken.sol";
import "./FiatContract.sol";


/**
 * @title CryptonityCrowdsale
 * @dev CryptonityCrowdsale
 */
// solium-disable-next-line max-len
contract CryptonityCrowdsale is CappedCrowdsale, TimedCrowdsale, WhitelistedCrowdsale, RefundableCrowdsale, PostDeliveryCrowdsale, Pausable {

  // public supply of token
  uint256 public publicSupply = 60000000 * 1 ether;
  // bounty supply of token
  uint256 public bountySupply = 10000000 * 1 ether;
  // team supply of the token
  uint256 public teamSupply = 20000000 * 1 ether;
  // advisors supply of the token
  uint256 public advisorsSupply = 3000000 * 1 ether;
  // team supply of the token
  uint256 public insuranceSupply = 7000000 * 1 ether;

  // remaining public supply of token
  uint256 public remainingPublicSupply = publicSupply;
  // remaining bounty supply of token
  uint256 public remainingBountySupply = bountySupply;
  // remaining team supply of token
  uint256 public remainingTeamSupply = teamSupply;
  // remaining advisors supply of token
  uint256 public remainingAdvisorsSupply = advisorsSupply;
  // remaining insurance supply of token
  uint256 public remainingInsuranceSupply = insuranceSupply;

  // phases start time in Unix epoch timestamp
  uint256 constant public phase1StartTime = 1541073600; // 2018-11-01 12:00 GMT+0
  uint256 constant public phase2StartTime = 1543665600; // 2018-12-01 12:00 GMT+0
  uint256 constant public phase3StartTime = 1544875200;  // 2018-12-15 12:00 GMT+0

  // phases bonuses in percentage
  uint256 constant public phase1Bonus = 50;
  uint256 constant public phase2Bonus = 30;
  uint256 constant public phase3Bonus = 15;

  uint256 deliveryTime;

  address public wallet;
  uint256 public rate;
  ERC20  public token;

  // token prices per phases
  uint256 public phase1TokenPrice;
  uint256 public phase2TokenPrice;
  uint256 public phase3TokenPrice;

  // token price per usd
  uint256 public tokenUSDPrice;
  // token price per wei
  uint256 public tokenWEIPrice;
  // one XNY token per ETH wei
  uint256 public oneTokenInWEI;

  /**
   * @param _openingTime Crowdsale opening time
   * @param _closingTime Crowdsale closing time
   * @param _rate Number of token units a buyer gets per wei
   * @param _wallet Address where collected funds will be forwarded to
   * @param _token Address of the token being sold
   * @param _softCap Funding goal
   * @param _hardCap Max amount of wei to be contributed
   */
  constructor(
    uint256 _openingTime,
    uint256 _closingTime,
    uint256 _rate,
    address _wallet,
    ERC20 _token,
    uint256 _softCap,
    uint256 _hardCap,
    address _fiatContract
  )
    public
    Crowdsale(_rate, _wallet, _token)
    CappedCrowdsale(_hardCap)
    TimedCrowdsale(_openingTime, _closingTime)
    RefundableCrowdsale(_softCap)
  {
    require(_rate > 0);
    require(_wallet != address(0));
    require(_token != address(0));
    require(_fiatContract != address(0));
    require(_softCap <= _hardCap);

    tokenWEIPrice = FiatContract(_fiatContract);

    rate = _rate;
    token = _token;
    wallet = _wallet;
    // token delivery starts 15 days after the crowdsale ends
    deliveryTime = _closingTime.add(60*60*24*15);
  }

  modifier onlyOwner() {
    require(msg.sender == owner);
    _;
  }

  /**
  * @dev Returns the token sale bonus percentage depending on the current time
  */
  function getCurrentBonus() public view returns (uint256) {
    require(now >= openingTime);

    if (now < phase2StartTime) {
      return phase1Bonus;
    } else if (now < phase3StartTime) {
      return phase2Bonus;
    } else if (now < closingTime) {
      return phase3Bonus;
    } else {
      return 0;
    }
  }

  /**
   * @dev Returns current token price depending on the current ICO phase
   */
  function getCurrentTokenPrice() public view returns (uint256) {
    require(now >= openingTime);
    require(now <= closingTime);

    if (now < phase2StartTime) {
      return phase1TokenPrice;
    } else if (now < phase3StartTime) {
      return phase2TokenPrice;
    } else (now < closingTime) {
      return phase3TokenPrice;
    }

  }

  /**
  * @dev Calculates and sets token price per ETH wei
  * @param _ETHPrice ether token price in USD
  * @param _tokenPriceByPhase XNY token price in USD per phase
  */
  function setTokenPricePerWei(uint256 _ETHPrice, uint256 _tokenPriceByPhase) internal onlyOwner {
    oneTokenInWei = (1 ether).mul(tokenPriceByPhase).div(etherPrice).div(100);
    // emit event(msg.sender);
  }

  /**
   * @dev Validation of an incoming purchase. Allowas purchases only when crowdsale is not paused.
   * @param _beneficiary Address performing the token purchase
   * @param _weiAmount Value in wei involved in the purchase
   */
  function _preValidatePurchase(address _beneficiary, uint256 _weiAmount) internal whenNotPaused {
    super._preValidatePurchase(_beneficiary, _weiAmount);
  }

  /**
   * @dev Executed when a purchase has been validated and is ready to be executed. Not necessarily emits/sends tokens.
   * It computes the bonus.
   * @param _beneficiary Address receiving the tokens
   * @param _tokenAmount Number of tokens to be purchased
   */
  function _processPurchase(address _beneficiary, uint256 _tokenAmount) internal {

    uint256 totalTokens = _tokenAmount;
    uint256 bonusPercent = getCurrentBonus();

    if (bonusPercent > 0) {
      uint256 bonusTokens = totalTokens.mul(bonusPercent).div(100); // tokens * bonus (%) / 100%
      totalTokens = totalTokens.add(bonusTokens);
    }

    super._processPurchase(_beneficiary, totalTokens);
  }

  /**
  * @dev Withdraw tokens only after the deliveryTime
  */
  function withdrawTokens() public {
    require(goalReached());
    // solium-disable-next-line security/no-block-members
    require(block.timestamp > deliveryTime);
    super.withdrawTokens();
  }

}